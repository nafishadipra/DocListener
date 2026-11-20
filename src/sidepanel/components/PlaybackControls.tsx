import { useState } from 'react';
import type { PlaybackSnapshot } from '../../shared/types';

interface PlaybackControlsProps {
  snapshot: PlaybackSnapshot;
  disabled: boolean;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onContinueAfterCode: () => void;
  onStop: () => void;
  onSeek: (seconds: number) => void;
  onSkip: (deltaSeconds: number) => void;
}

/**
 * Format seconds as M:SS (e.g. 125 -> "2:05").
 */
function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function PlaybackControls({
  snapshot,
  disabled,
  onPlay,
  onPause,
  onResume,
  onContinueAfterCode,
  onStop,
  onSeek,
  onSkip,
}: PlaybackControlsProps) {
  const { status, currentBlockIndex, totalBlocks, currentBlock, elapsedSeconds, totalSeconds } =
    snapshot;

  const [dragSeconds, setDragSeconds] = useState<number | null>(null);

  const isSpeaking = status === 'speaking';
  const isPaused = status === 'paused';
  const isPausedAtCode = status === 'paused-at-code';
  const canStop = isSpeaking || isPaused || isPausedAtCode;
  const hasTimeline = totalSeconds > 0 && !disabled;

  const displayedSeconds = dragSeconds ?? elapsedSeconds;

  const handlePrimaryAction = () => {
    if (isSpeaking) {
      onPause();
    } else if (isPaused) {
      onResume();
    } else if (isPausedAtCode) {
      onContinueAfterCode();
    } else {
      onPlay();
    }
  };

  const handleScrubCommit = () => {
    if (dragSeconds !== null) {
      onSeek(dragSeconds);
      setDragSeconds(null);
    }
  };

  const primaryLabel = isSpeaking
    ? 'Pause'
    : isPaused
      ? 'Resume'
      : isPausedAtCode
        ? 'Continue after code'
        : 'Play';

  return (
    <section aria-label="Playback controls" className="space-y-3">
      {/* Music-player style timeline scrubber */}
      {hasTimeline && (
        <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
          <input
            type="range"
            min={0}
            max={totalSeconds}
            step={1}
            value={Math.min(displayedSeconds, totalSeconds)}
            aria-label="Seek reading position"
            aria-valuetext={`${formatTime(displayedSeconds)} of ${formatTime(totalSeconds)}`}
            onChange={(event) => setDragSeconds(Number(event.target.value))}
            onMouseUp={handleScrubCommit}
            onTouchEnd={handleScrubCommit}
            onKeyUp={handleScrubCommit}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          />
          <div className="mt-1.5 flex items-center justify-between text-[11px] font-medium tabular-nums text-slate-500">
            <span>{formatTime(displayedSeconds)}</span>
            <span>{formatTime(totalSeconds)}</span>
          </div>
        </div>
      )}

      {/* Primary action row: -15s, Play/Pause, +15s, Stop */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onSkip(-15)}
          disabled={!hasTimeline}
          aria-label="Go back 15 seconds"
          title="Go back 15 seconds"
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 text-xs font-medium tabular-nums text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          −15s
        </button>

        <button
          type="button"
          onClick={handlePrimaryAction}
          disabled={disabled}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          {isSpeaking ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
            >
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : isPausedAtCode ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <polygon points="5 4 15 12 5 20 5 4" />
              <line x1="19" y1="5" x2="19" y2="19" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
            >
              <polygon points="6 4 20 12 6 20 6 4" />
            </svg>
          )}
          <span className="truncate">{primaryLabel}</span>
        </button>

        <button
          type="button"
          onClick={() => onSkip(15)}
          disabled={!hasTimeline}
          aria-label="Skip forward 15 seconds"
          title="Skip forward 15 seconds"
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 py-2.5 text-xs font-medium tabular-nums text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          +15s
        </button>

        <button
          type="button"
          onClick={onStop}
          disabled={!canStop}
          aria-label="Stop playback"
          title="Stop playback"
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-4 w-4"
          >
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>
      </div>

      {/* Dedicated code-block pause card */}
      {isPausedAtCode && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-slate-300 bg-slate-50 p-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5 text-slate-700"
              >
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              Paused at code block
            </span>
            {currentBlock?.language && (
              <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-600">
                {currentBlock.language}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Code blocks are skipped during audio narration. Review the code on the page,
            then click <span className="font-medium text-slate-900">Continue after code</span> to
            resume reading.
          </p>
        </div>
      )}

      {/* Current reading block preview */}
      {totalBlocks > 0 && currentBlock && !isPausedAtCode && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
            <span>{isSpeaking ? 'Now reading' : 'Current section'}</span>
            <span>
              {currentBlockIndex + 1} / {totalBlocks}
            </span>
          </div>
          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-700">
            {currentBlock.text}
          </p>
        </div>
      )}
    </section>
  );
}
