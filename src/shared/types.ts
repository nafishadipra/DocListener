/**
 * Shared types for DocListener.
 * Kept intentionally small and explicit so every module shares a single contract.
 */

export type BlockType = 'heading' | 'paragraph' | 'list-item' | 'code';

export interface DocumentBlock {
  /** Stable identifier within the extracted document (e.g. "block-0"). */
  id: string;
  /** Semantic type of this block. Code blocks trigger a pause instead of speech. */
  type: BlockType;
  /** Exact extracted text with whitespace normalized for narration. */
  text: string;
  /** Heading level (1–6) when type === 'heading'. */
  level?: number;
  /** Optional programming language hint when type === 'code'. */
  language?: string;
}

export interface DocumentHeading {
  /** Matches the corresponding DocumentBlock.id. */
  id: string;
  /** Heading level (1–6). */
  level: number;
  /** Heading text as written in the page. */
  text: string;
  /** Index into ExtractedDocument.blocks where playback should begin. */
  blockIndex: number;
}

export interface ExtractedDocument {
  title: string;
  url: string;
  blocks: DocumentBlock[];
  headings: DocumentHeading[];
  extractedAt: number;
  method: 'readability' | 'fallback';
  /** Honest notes about constructs that cannot be narrated accurately (e.g. diagrams, math). */
  unsupportedNotes: string[];
}

export type ExtractionErrorCode =
  | 'PERMISSION_REQUIRED'
  | 'RESTRICTED_PAGE'
  | 'EMPTY_PAGE'
  | 'EXTRACTION_ERROR';

export type ExtractionResult =
  | {
      ok: true;
      document: ExtractedDocument;
    }
  | {
      ok: false;
      code: ExtractionErrorCode;
      message: string;
    };

export type PlaybackStatus =
  | 'idle'
  | 'extracting'
  | 'ready'
  | 'speaking'
  | 'paused'
  | 'paused-at-code'
  | 'stopped'
  | 'error';

export interface PlaybackSnapshot {
  status: PlaybackStatus;
  currentBlockIndex: number;
  totalBlocks: number;
  currentBlock: DocumentBlock | null;
  /** Estimated elapsed reading time in seconds at the current narration speed. */
  elapsedSeconds: number;
  /** Estimated total reading time in seconds at the current narration speed. */
  totalSeconds: number;
  errorMessage: string | null;
}

export interface TtsVoiceInfo {
  name: string;
  lang: string;
  isLocal: boolean;
}

export interface UserPreferences {
  /** Speech rate multiplier (0.5 to 2.0). */
  rate: number;
  /** Selected chrome.tts voice name, or empty string for the default voice. */
  voiceName: string;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  rate: 1.0,
  voiceName: '',
};

/**
 * Full reader state owned by the background service worker and synced to the side panel.
 * Keeping state in the background allows playback to continue when the side panel is closed.
 */
export interface ReaderState {
  doc: ExtractedDocument | null;
  loadedTabId: number | null;
  playback: PlaybackSnapshot;
  preferences: UserPreferences;
  isExtracting: boolean;
  needsPermission: boolean;
  extractionError: string | null;
  tabChangeNotice: string | null;
}

/** Messages sent between the side panel and the background service worker. */
export type ExtensionMessage =
  | { type: 'GET_READER_STATE' }
  | { type: 'GET_VOICES' }
  | { type: 'EXTRACT_ACTIVE_TAB' }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'CONTINUE_AFTER_CODE' }
  | { type: 'STOP' }
  | { type: 'JUMP_TO_BLOCK'; blockIndex: number }
  | { type: 'SEEK_TO_SECONDS'; seconds: number }
  | { type: 'SKIP_BY_SECONDS'; deltaSeconds: number }
  | { type: 'SET_RATE'; rate: number }
  | { type: 'SET_VOICE'; voiceName: string }
  | { type: 'READER_STATE_UPDATE'; state: ReaderState };
