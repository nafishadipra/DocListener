import type { PlaybackStatus } from '../../shared/types';

interface HeaderProps {
  status: PlaybackStatus;
  isExtracting: boolean;
  onRefresh: () => void;
}

const STATUS_LABELS: Record<PlaybackStatus, string> = {
  idle: 'Idle',
  extracting: 'Reading page…',
  ready: 'Ready',
  speaking: 'Speaking',
  paused: 'Paused',
  'paused-at-code': 'Paused at code',
  stopped: 'Stopped',
  error: 'Error',
};

export function Header({ status, isExtracting, onRefresh }: HeaderProps) {
  const isActive = status === 'speaking';

  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center gap-2.5">
        <h1 className="text-sm font-semibold tracking-tight text-slate-900">
          DocListener
        </h1>
        <span
          role="status"
          aria-live="polite"
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
            isActive
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          {isActive && (
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-white"
            />
          )}
          {STATUS_LABELS[status]}
        </span>
      </div>

      <button
        type="button"
        onClick={onRefresh}
        disabled={isExtracting}
        aria-label="Reload current page content"
        title="Reload current page content"
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3.5 w-3.5 ${isExtracting ? 'animate-spin' : ''}`}
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
        Reload
      </button>
    </header>
  );
}
