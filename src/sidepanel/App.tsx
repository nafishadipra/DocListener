import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_PREFERENCES,
  type ExtensionMessage,
  type ReaderState,
  type TtsVoiceInfo,
} from '../shared/types';
import { AudioSettings } from './components/AudioSettings';
import { Header } from './components/Header';
import { HeadingList } from './components/HeadingList';
import { NoticeBanner } from './components/NoticeBanner';
import { PlaybackControls } from './components/PlaybackControls';

const INITIAL_STATE: ReaderState = {
  doc: null,
  loadedTabId: null,
  playback: {
    status: 'idle',
    currentBlockIndex: 0,
    totalBlocks: 0,
    currentBlock: null,
    elapsedSeconds: 0,
    totalSeconds: 0,
    errorMessage: null,
  },
  preferences: { ...DEFAULT_PREFERENCES },
  isExtracting: false,
  needsPermission: false,
  extractionError: null,
  tabChangeNotice: null,
};

/**
 * Format a full URL into a clean host + path string for the header card.
 */
function formatDisplayUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${parsed.hostname}${path}`;
  } catch {
    return rawUrl;
  }
}

export function App() {
  const [readerState, setReaderState] = useState<ReaderState>(INITIAL_STATE);
  const [voices, setVoices] = useState<TtsVoiceInfo[]>([]);

  const sendCommand = useCallback(async (message: ExtensionMessage) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      return;
    }

    try {
      const updated = (await chrome.runtime.sendMessage(message)) as ReaderState | undefined;
      if (updated && typeof updated === 'object' && 'playback' in updated) {
        setReaderState(updated);
      }
    } catch {
      // Ignore transient disconnect errors if service worker is waking up.
    }
  }, []);

  // Reconnect to live background state on panel open (without interrupting playback).
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      setReaderState((prev) => ({
        ...prev,
        extractionError: 'DocListener must run inside Google Chrome as an extension.',
      }));
      return;
    }

    void sendCommand({ type: 'GET_READER_STATE' });

    chrome.runtime
      .sendMessage({ type: 'GET_VOICES' } satisfies ExtensionMessage)
      .then((result) => {
        if (Array.isArray(result)) {
          setVoices(result as TtsVoiceInfo[]);
        }
      })
      .catch(() => {});

    const handleMessage = (message: ExtensionMessage) => {
      if (message.type === 'READER_STATE_UPDATE') {
        setReaderState(message.state);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      // Do not stop playback when the side panel closes — reading continues in background.
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [sendCommand]);

  const {
    doc,
    playback,
    preferences,
    isExtracting,
    needsPermission,
    extractionError,
    tabChangeNotice,
  } = readerState;

  const effectiveStatus = isExtracting
    ? 'extracting'
    : extractionError
      ? 'error'
      : playback.status;

  const activeError = extractionError ?? playback.errorMessage;
  const codeBlockCount = doc?.blocks.filter((b) => b.type === 'code').length ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <Header
        status={effectiveStatus}
        isExtracting={isExtracting}
        onRefresh={() => void sendCommand({ type: 'EXTRACT_ACTIVE_TAB' })}
      />

      <main className="flex flex-1 flex-col gap-4 p-4">
        {/* Tab change / navigation invalidation banner */}
        {tabChangeNotice && (
          <NoticeBanner
            tone="neutral"
            title="Page changed"
            description={tabChangeNotice}
            actionLabel="Load page"
            onAction={() => void sendCommand({ type: 'EXTRACT_ACTIVE_TAB' })}
          />
        )}

        {/* Active-tab click prompt (no host permission popup needed) */}
        {needsPermission && (
          <NoticeBanner
            tone="neutral"
            title="Click the DocListener icon to read this tab"
            description="For privacy, DocListener only reads a tab when you click the D icon in Chrome’s top toolbar."
          />
        )}

        {/* Actionable error banner */}
        {activeError && (
          <NoticeBanner
            tone="error"
            title="Unable to read page"
            description={activeError}
            actionLabel="Try again"
            onAction={() => void sendCommand({ type: 'EXTRACT_ACTIVE_TAB' })}
          />
        )}

        {/* Document identity card */}
        {doc && (
          <section
            aria-label="Current document"
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-3"
          >
            <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
              {doc.title}
            </h2>
            <p title={doc.url} className="mt-1 truncate text-xs text-slate-500">
              {formatDisplayUrl(doc.url)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span>{doc.blocks.length} blocks</span>
              <span>·</span>
              <span>{doc.headings.length} sections</span>
              {codeBlockCount > 0 && (
                <>
                  <span>·</span>
                  <span>
                    {codeBlockCount} code {codeBlockCount === 1 ? 'block' : 'blocks'} (auto-pause)
                  </span>
                </>
              )}
            </div>
          </section>
        )}

        {/* Playback controls & timeline scrubber */}
        <PlaybackControls
          snapshot={playback}
          disabled={!doc || isExtracting}
          onPlay={() => void sendCommand({ type: 'PLAY' })}
          onPause={() => void sendCommand({ type: 'PAUSE' })}
          onResume={() => void sendCommand({ type: 'RESUME' })}
          onContinueAfterCode={() => void sendCommand({ type: 'CONTINUE_AFTER_CODE' })}
          onStop={() => void sendCommand({ type: 'STOP' })}
          onSeek={(seconds) => void sendCommand({ type: 'SEEK_TO_SECONDS', seconds })}
          onSkip={(deltaSeconds) => void sendCommand({ type: 'SKIP_BY_SECONDS', deltaSeconds })}
        />

        {/* Audio settings (Speed & Voice) */}
        <AudioSettings
          rate={preferences.rate}
          voiceName={preferences.voiceName}
          voices={voices}
          onRateChange={(rate) => void sendCommand({ type: 'SET_RATE', rate })}
          onVoiceChange={(voiceName) => void sendCommand({ type: 'SET_VOICE', voiceName })}
        />

        {/* Section / Heading navigation */}
        {doc && (
          <HeadingList
            headings={doc.headings}
            currentBlockIndex={playback.currentBlockIndex}
            onSelectHeading={(blockIndex) =>
              void sendCommand({ type: 'JUMP_TO_BLOCK', blockIndex })
            }
          />
        )}

        {/* Honest unsupported-content notes (e.g. math, diagrams) */}
        {doc && doc.unsupportedNotes.length > 0 && (
          <NoticeBanner
            tone="neutral"
            title="Content note"
            description={doc.unsupportedNotes.join(' ')}
          />
        )}
      </main>

      <footer className="border-t border-slate-100 bg-white px-4 py-2.5 text-center text-[11px] text-slate-400">
        Local-first · Continues reading if panel is closed
      </footer>
    </div>
  );
}
