interface NoticeBannerProps {
  tone: 'neutral' | 'error';
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function NoticeBanner({
  tone,
  title,
  description,
  actionLabel,
  onAction,
}: NoticeBannerProps) {
  const containerStyles =
    tone === 'error'
      ? 'border-slate-300 bg-slate-50 text-slate-900'
      : 'border-slate-200 bg-slate-50 text-slate-800';

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border px-3.5 py-3 ${containerStyles}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900">{title}</p>
          {description && (
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {description}
            </p>
          )}
        </div>

        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
