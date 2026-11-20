import type {
  DocumentBlock,
  PlaybackSnapshot,
  PlaybackStatus,
  TtsVoiceInfo,
} from './types';
import { clampRate } from './preferences';

export interface TtsEvent {
  type: string;
  errorMessage?: string;
}

export interface TtsSpeakOptions {
  rate: number;
  voiceName?: string;
  onEvent: (event: TtsEvent) => void;
}

/**
 * Minimal adapter over chrome.tts so playback logic is easy to read and unit-test.
 */
export interface TtsAdapter {
  speak: (text: string, options: TtsSpeakOptions) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  getVoices: () => Promise<TtsVoiceInfo[]>;
}

interface TimelineSegment {
  blockIndex: number;
  chunkIndex: number;
  text: string;
  wordCount: number;
  startWordOffset: number;
}

type PlaybackListener = (snapshot: PlaybackSnapshot) => void;

/**
 * Keep chunks under ~200 characters so each utterance finishes in ~8–12 seconds.
 * This prevents TTS truncation and keeps the Manifest V3 service worker awake during playback.
 */
const MAX_CHUNK_LENGTH = 200;

/** Average narration pace at 1.0x speed (~155 words per minute). */
const BASE_WORDS_PER_SECOND = 155 / 60;

/**
 * Count spoken words in a text segment (minimum 1 so short headings advance the timeline).
 */
export function countWords(text: string): number {
  const matches = text.trim().split(/\s+/).filter(Boolean);
  return Math.max(1, matches.length);
}

/**
 * Split a long text block into smaller sentence-aligned chunks in strict source order
 * so Chrome's TTS engine does not drop or truncate long paragraphs.
 */
export function splitIntoChunks(text: string, maxLength = MAX_CHUNK_LENGTH): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.length <= maxLength) {
    return [trimmed];
  }

  const sentences = trimmed.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let buffer = '';

  const flushBuffer = () => {
    if (buffer.trim()) {
      chunks.push(buffer.trim());
      buffer = '';
    }
  };

  for (const sentence of sentences) {
    if (sentence.length > maxLength) {
      flushBuffer();
      const words = sentence.split(/\s+/);
      let wordBuffer = '';
      for (const word of words) {
        const candidate = wordBuffer ? `${wordBuffer} ${word}` : word;
        if (candidate.length > maxLength && wordBuffer) {
          chunks.push(wordBuffer);
          wordBuffer = word;
        } else {
          wordBuffer = candidate;
        }
      }
      if (wordBuffer) {
        chunks.push(wordBuffer);
      }
      continue;
    }

    const candidate = buffer ? `${buffer} ${sentence}` : sentence;
    if (candidate.length > maxLength && buffer) {
      flushBuffer();
      buffer = sentence;
    } else {
      buffer = candidate;
    }
  }

  flushBuffer();
  return chunks;
}

/**
 * Default adapter backed by Chrome's chrome.tts API.
 * Sorts local voices ahead of remote voices to favor offline speech where available.
 */
export const chromeTtsAdapter: TtsAdapter = {
  speak(text, options) {
    if (typeof chrome === 'undefined' || !chrome.tts) {
      options.onEvent({
        type: 'error',
        errorMessage: 'Chrome text-to-speech is unavailable in this environment.',
      });
      return;
    }

    const ttsOptions: chrome.tts.SpeakOptions = {
      rate: options.rate,
      onEvent: (event: chrome.tts.TtsEvent) => {
        options.onEvent({
          type: event.type,
          errorMessage: event.errorMessage,
        });
      },
    };

    if (options.voiceName) {
      ttsOptions.voiceName = options.voiceName;
    }

    chrome.tts.speak(text, ttsOptions, () => {
      if (chrome.runtime?.lastError) {
        options.onEvent({
          type: 'error',
          errorMessage: chrome.runtime.lastError.message ?? 'Speech synthesis failed.',
        });
      }
    });
  },

  pause() {
    chrome.tts?.pause();
  },

  resume() {
    chrome.tts?.resume();
  },

  stop() {
    chrome.tts?.stop();
  },

  async getVoices(): Promise<TtsVoiceInfo[]> {
    if (typeof chrome === 'undefined' || !chrome.tts) {
      return [];
    }

    return new Promise((resolve) => {
      chrome.tts.getVoices((voices) => {
        const mapped: TtsVoiceInfo[] = voices
          .filter((voice): voice is chrome.tts.TtsVoice & { voiceName: string } =>
            Boolean(voice.voiceName),
          )
          .map((voice) => ({
            name: voice.voiceName,
            lang: voice.lang ?? '',
            isLocal: voice.remote !== true,
          }))
          .sort((a, b) => {
            if (a.isLocal !== b.isLocal) {
              return a.isLocal ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          });

        resolve(mapped);
      });
    });
  },
};

/**
 * Controls ordered verbatim narration of DocumentBlocks with a word-based seek timeline.
 * Automatically pauses at code blocks without reading them aloud so the user
 * can inspect the code and explicitly resume reading after the code block.
 */
export class PlaybackController {
  private readonly tts: TtsAdapter;
  private blocks: DocumentBlock[] = [];
  private chunksByBlock: string[][] = [];
  private timeline: TimelineSegment[] = [];
  private totalWords = 0;

  private status: PlaybackStatus = 'idle';
  private currentBlockIndex = 0;
  private currentChunkIndex = 0;
  private rate = 1.0;
  private voiceName = '';
  private errorMessage: string | null = null;
  private playbackToken = 0;
  private listeners = new Set<PlaybackListener>();

  constructor(tts: TtsAdapter = chromeTtsAdapter) {
    this.tts = tts;
  }

  subscribe(listener: PlaybackListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): PlaybackSnapshot {
    return {
      status: this.status,
      currentBlockIndex: this.currentBlockIndex,
      totalBlocks: this.blocks.length,
      currentBlock: this.blocks[this.currentBlockIndex] ?? null,
      elapsedSeconds: this.getElapsedSeconds(),
      totalSeconds: this.getTotalSeconds(),
      errorMessage: this.errorMessage,
    };
  }

  async getVoices(): Promise<TtsVoiceInfo[]> {
    return this.tts.getVoices();
  }

  setRate(rate: number): void {
    this.rate = clampRate(rate);
    // Re-emit so total/elapsed timeline durations update immediately for the new speed.
    this.emit();
  }

  setVoice(voiceName: string): void {
    this.voiceName = voiceName;
  }

  /**
   * Load a freshly extracted list of document blocks, build the seek timeline,
   * and reset playback to ready.
   */
  loadBlocks(blocks: DocumentBlock[]): void {
    this.playbackToken += 1;
    this.tts.stop();

    this.blocks = blocks;
    this.chunksByBlock = [];
    this.timeline = [];

    let wordCursor = 0;
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
      const block = blocks[blockIndex];
      if (!block || block.type === 'code') {
        this.chunksByBlock.push([]);
        continue;
      }

      const chunks = splitIntoChunks(block.text);
      this.chunksByBlock.push(chunks);

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunkText = chunks[chunkIndex]!;
        const wordCount = countWords(chunkText);
        this.timeline.push({
          blockIndex,
          chunkIndex,
          text: chunkText,
          wordCount,
          startWordOffset: wordCursor,
        });
        wordCursor += wordCount;
      }
    }

    this.totalWords = wordCursor;
    this.currentBlockIndex = 0;
    this.currentChunkIndex = 0;
    this.errorMessage = null;
    this.status = blocks.length > 0 ? 'ready' : 'idle';
    this.emit();
  }

  /**
   * Clear loaded blocks (e.g. when switching tabs or resetting state).
   */
  reset(): void {
    this.loadBlocks([]);
  }

  /**
   * Start playback from the specified block/chunk index (defaults to current playhead).
   */
  play(startBlockIndex?: number, startChunkIndex?: number): void {
    if (this.blocks.length === 0) {
      return;
    }

    if (startBlockIndex === undefined && this.status === 'paused') {
      this.resume();
      return;
    }

    if (startBlockIndex === undefined && this.status === 'paused-at-code') {
      this.continueAfterCode();
      return;
    }

    const targetBlock =
      startBlockIndex !== undefined
        ? Math.max(0, Math.min(startBlockIndex, this.blocks.length - 1))
        : this.currentBlockIndex;

    const targetChunk =
      startBlockIndex !== undefined
        ? Math.max(0, startChunkIndex ?? 0)
        : this.currentChunkIndex;

    this.playbackToken += 1;
    this.tts.stop();
    this.errorMessage = null;
    this.currentBlockIndex = targetBlock;
    this.currentChunkIndex = targetChunk;
    this.beginCurrentBlock(targetChunk);
  }

  /**
   * Jump directly to a heading or block index and start reading from there.
   */
  jumpToBlock(blockIndex: number): void {
    this.play(blockIndex, 0);
  }

  /**
   * Seek to a target timestamp in seconds on the estimated reading timeline.
   * If currently speaking, continues speaking from the new spot immediately;
   * otherwise moves the playhead there cleanly.
   */
  seekToSeconds(seconds: number): void {
    if (this.timeline.length === 0) {
      return;
    }

    const totalSeconds = this.getTotalSeconds();
    const clampedSeconds = Math.max(0, Math.min(seconds, totalSeconds));
    const targetWordOffset = clampedSeconds * BASE_WORDS_PER_SECOND * this.rate;

    // Find the segment containing targetWordOffset.
    let targetSegment = this.timeline[0]!;
    for (const segment of this.timeline) {
      if (segment.startWordOffset <= targetWordOffset) {
        targetSegment = segment;
      } else {
        break;
      }
    }

    const wasSpeaking = this.status === 'speaking';
    this.playbackToken += 1;
    this.tts.stop();
    this.errorMessage = null;
    this.currentBlockIndex = targetSegment.blockIndex;
    this.currentChunkIndex = targetSegment.chunkIndex;

    if (wasSpeaking) {
      this.beginCurrentBlock(targetSegment.chunkIndex);
    } else {
      this.status = 'ready';
      this.emit();
    }
  }

  /**
   * Skip backward (negative delta) or forward (positive delta) by a number of seconds.
   */
  skipBySeconds(deltaSeconds: number): void {
    if (this.timeline.length === 0) {
      return;
    }
    this.seekToSeconds(this.getElapsedSeconds() + deltaSeconds);
  }

  pause(): void {
    if (this.status !== 'speaking') {
      return;
    }

    this.tts.pause();
    this.status = 'paused';
    this.emit();
  }

  resume(): void {
    if (this.status === 'paused-at-code') {
      this.continueAfterCode();
      return;
    }

    if (this.status !== 'paused') {
      return;
    }

    this.tts.resume();
    this.status = 'speaking';
    this.emit();
  }

  /**
   * Skip past the current code block (and any immediately following code blocks)
   * and resume verbatim reading from the next readable block.
   */
  continueAfterCode(): void {
    if (this.status !== 'paused-at-code') {
      return;
    }

    let nextIndex = this.currentBlockIndex + 1;
    while (nextIndex < this.blocks.length && this.blocks[nextIndex]?.type === 'code') {
      nextIndex += 1;
    }

    if (nextIndex >= this.blocks.length) {
      this.finishDocument();
      return;
    }

    this.playbackToken += 1;
    this.tts.stop();
    this.currentBlockIndex = nextIndex;
    this.currentChunkIndex = 0;
    this.beginCurrentBlock(0);
  }

  stop(): void {
    this.playbackToken += 1;
    this.tts.stop();
    this.currentBlockIndex = 0;
    this.currentChunkIndex = 0;
    this.errorMessage = null;
    this.status = this.blocks.length > 0 ? 'stopped' : 'idle';
    this.emit();
  }

  private getTotalSeconds(): number {
    if (this.totalWords === 0) {
      return 0;
    }
    return Math.round(this.totalWords / (BASE_WORDS_PER_SECOND * this.rate));
  }

  private getElapsedSeconds(): number {
    if (this.timeline.length === 0) {
      return 0;
    }

    // Find the first segment at or after the current playhead.
    for (const segment of this.timeline) {
      if (
        segment.blockIndex > this.currentBlockIndex ||
        (segment.blockIndex === this.currentBlockIndex &&
          segment.chunkIndex >= this.currentChunkIndex)
      ) {
        return Math.round(segment.startWordOffset / (BASE_WORDS_PER_SECOND * this.rate));
      }
    }

    return this.getTotalSeconds();
  }

  private beginCurrentBlock(startChunkIndex = 0): void {
    if (this.currentBlockIndex >= this.blocks.length) {
      this.finishDocument();
      return;
    }

    const block = this.blocks[this.currentBlockIndex];
    if (!block) {
      this.finishDocument();
      return;
    }

    // Never read code blocks aloud: pause and let the user continue after the code.
    if (block.type === 'code') {
      this.status = 'paused-at-code';
      this.currentChunkIndex = 0;
      this.emit();
      return;
    }

    const chunks = this.chunksByBlock[this.currentBlockIndex] ?? [];
    if (chunks.length === 0) {
      this.currentBlockIndex += 1;
      this.beginCurrentBlock(0);
      return;
    }

    this.currentChunkIndex = Math.max(0, Math.min(startChunkIndex, chunks.length - 1));
    this.status = 'speaking';
    this.emit();
    this.speakCurrentChunk(this.playbackToken);
  }

  private speakCurrentChunk(token: number): void {
    const chunks = this.chunksByBlock[this.currentBlockIndex] ?? [];
    const chunk = chunks[this.currentChunkIndex];
    if (!chunk) {
      this.currentBlockIndex += 1;
      this.beginCurrentBlock(0);
      return;
    }

    this.tts.speak(chunk, {
      rate: this.rate,
      voiceName: this.voiceName || undefined,
      onEvent: (event) => {
        // Ignore stale events from utterances interrupted by stop/seek/jump/reload.
        if (token !== this.playbackToken) {
          return;
        }

        if (event.type === 'end') {
          this.currentChunkIndex += 1;
          if (this.currentChunkIndex < chunks.length) {
            // Emit progress update so the timeline scrubber advances smoothly per chunk.
            this.emit();
            this.speakCurrentChunk(token);
          } else {
            this.currentBlockIndex += 1;
            this.beginCurrentBlock(0);
          }
          return;
        }

        if (event.type === 'error') {
          this.status = 'error';
          this.errorMessage =
            event.errorMessage ||
            'Speech playback failed. Check that a voice is installed in Chrome and try again.';
          this.emit();
        }
      },
    });
  }

  private finishDocument(): void {
    this.playbackToken += 1;
    this.tts.stop();
    this.currentBlockIndex = 0;
    this.currentChunkIndex = 0;
    this.status = 'stopped';
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
