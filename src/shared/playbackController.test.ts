import { describe, expect, it, vi } from 'vitest';
import type { DocumentBlock } from './types';
import {
  PlaybackController,
  splitIntoChunks,
  type TtsAdapter,
  type TtsSpeakOptions,
} from './playbackController';

function createMockTts() {
  const spoken: Array<{ text: string; rate: number; voiceName?: string }> = [];
  let activeOnEvent: TtsSpeakOptions['onEvent'] | null = null;

  const adapter: TtsAdapter = {
    speak: vi.fn((text: string, options: TtsSpeakOptions) => {
      spoken.push({ text, rate: options.rate, voiceName: options.voiceName });
      activeOnEvent = options.onEvent;
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(() => {
      activeOnEvent = null;
    }),
    getVoices: vi.fn(async () => [
      { name: 'Local English', lang: 'en-US', isLocal: true },
    ]),
  };

  const finishCurrentUtterance = () => {
    activeOnEvent?.({ type: 'end' });
  };

  const failCurrentUtterance = (message: string) => {
    activeOnEvent?.({ type: 'error', errorMessage: message });
  };

  return { adapter, spoken, finishCurrentUtterance, failCurrentUtterance };
}

const SAMPLE_BLOCKS: DocumentBlock[] = [
  { id: 'block-0', type: 'heading', level: 1, text: 'Introduction' },
  { id: 'block-1', type: 'paragraph', text: 'First paragraph before code.' },
  { id: 'block-2', type: 'code', language: 'ts', text: 'const x = 42;' },
  { id: 'block-3', type: 'paragraph', text: 'Second paragraph after code.' },
  { id: 'block-4', type: 'heading', level: 2, text: 'Summary' },
  { id: 'block-5', type: 'paragraph', text: 'Closing remarks.' },
];

describe('splitIntoChunks', () => {
  it('splits long text into ordered sentence chunks within max length', () => {
    const text =
      'First sentence is clear. Second sentence adds detail. Third sentence concludes the thought.';
    const chunks = splitIntoChunks(text, 55);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(' ')).toBe(text);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(55);
    }
  });
});

describe('PlaybackController', () => {
  it('pauses at code blocks without reading them and resumes after code on continue', () => {
    const { adapter, spoken, finishCurrentUtterance } = createMockTts();
    const controller = new PlaybackController(adapter);

    controller.loadBlocks(SAMPLE_BLOCKS);
    expect(controller.getSnapshot().status).toBe('ready');

    controller.play();
    expect(controller.getSnapshot().status).toBe('speaking');
    expect(spoken[0]?.text).toBe('Introduction');

    finishCurrentUtterance();
    expect(spoken[1]?.text).toBe('First paragraph before code.');

    // Finishing the paragraph before the code block should pause at the code block.
    finishCurrentUtterance();
    expect(controller.getSnapshot().status).toBe('paused-at-code');
    expect(controller.getSnapshot().currentBlock?.type).toBe('code');
    expect(spoken).toHaveLength(2); // Code block was NOT spoken.

    // User triggers continue -> resumes reading right after the code block.
    controller.continueAfterCode();
    expect(controller.getSnapshot().status).toBe('speaking');
    expect(spoken[2]?.text).toBe('Second paragraph after code.');
  });

  it('supports pause, resume, stop, and speed updates for subsequent segments', () => {
    const { adapter, spoken, finishCurrentUtterance } = createMockTts();
    const controller = new PlaybackController(adapter);

    controller.loadBlocks(SAMPLE_BLOCKS);
    controller.play();
    expect(spoken[0]?.rate).toBe(1.0);

    controller.pause();
    expect(controller.getSnapshot().status).toBe('paused');
    expect(adapter.pause).toHaveBeenCalledTimes(1);

    controller.setRate(1.5);
    controller.resume();
    expect(controller.getSnapshot().status).toBe('speaking');
    expect(adapter.resume).toHaveBeenCalledTimes(1);

    finishCurrentUtterance();
    expect(spoken[1]?.rate).toBe(1.5);

    controller.stop();
    expect(controller.getSnapshot().status).toBe('stopped');
    expect(controller.getSnapshot().currentBlockIndex).toBe(0);
  });

  it('jumps directly to a heading block index', () => {
    const { adapter, spoken } = createMockTts();
    const controller = new PlaybackController(adapter);

    controller.loadBlocks(SAMPLE_BLOCKS);
    controller.jumpToBlock(4);

    expect(controller.getSnapshot().status).toBe('speaking');
    expect(controller.getSnapshot().currentBlockIndex).toBe(4);
    expect(spoken[0]?.text).toBe('Summary');
  });

  it('supports seeking forward and skipping backward along the estimated timeline', () => {
    const { adapter, spoken } = createMockTts();
    const controller = new PlaybackController(adapter);

    // Build a multi-paragraph article (~120 words -> ~46s at 1.0x).
    const longBlocks: DocumentBlock[] = Array.from({ length: 6 }, (_, i) => ({
      id: `block-${i}`,
      type: 'paragraph',
      text: `Section ${i} ` + 'word '.repeat(20).trim() + '.',
    }));

    controller.loadBlocks(longBlocks);
    const initial = controller.getSnapshot();
    expect(initial.totalSeconds).toBeGreaterThan(30);
    expect(initial.elapsedSeconds).toBe(0);

    // Start playing and seek halfway into the document.
    controller.play();
    const midpoint = Math.floor(initial.totalSeconds / 2);
    controller.seekToSeconds(midpoint);

    const midSnapshot = controller.getSnapshot();
    expect(midSnapshot.status).toBe('speaking');
    expect(midSnapshot.currentBlockIndex).toBeGreaterThan(0);
    expect(midSnapshot.elapsedSeconds).toBeGreaterThan(0);

    // Skip backward 15 seconds and verify we move earlier in the document.
    controller.skipBySeconds(-15);
    const afterBack = controller.getSnapshot();
    expect(afterBack.status).toBe('speaking');
    expect(afterBack.elapsedSeconds).toBeLessThan(midSnapshot.elapsedSeconds);
    expect(spoken[spoken.length - 1]?.text).toContain(`Section ${afterBack.currentBlockIndex}`);
  });

  it('transitions to error state with message on TTS failure', () => {
    const { adapter, failCurrentUtterance } = createMockTts();
    const controller = new PlaybackController(adapter);

    controller.loadBlocks(SAMPLE_BLOCKS);
    controller.play();
    failCurrentUtterance('Voice unavailable');

    expect(controller.getSnapshot().status).toBe('error');
    expect(controller.getSnapshot().errorMessage).toBe('Voice unavailable');
  });
});
