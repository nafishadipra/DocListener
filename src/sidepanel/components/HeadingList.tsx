import type { DocumentHeading } from '../../shared/types';

interface HeadingListProps {
  headings: DocumentHeading[];
  currentBlockIndex: number;
  onSelectHeading: (blockIndex: number) => void;
}

/**
 * Determine which heading section the current playback block belongs to.
 */
function findActiveHeadingId(
  headings: DocumentHeading[],
  currentBlockIndex: number,
): string | null {
  let activeId: string | null = null;
  for (const heading of headings) {
    if (heading.blockIndex <= currentBlockIndex) {
      activeId = heading.id;
    } else {
      break;
    }
  }
  return activeId;
}

export function HeadingList({
  headings,
  currentBlockIndex,
  onSelectHeading,
}: HeadingListProps) {
  if (headings.length === 0) {
    return null;
  }

  const activeHeadingId = findActiveHeadingId(headings, currentBlockIndex);
  const minLevel = Math.min(...headings.map((h) => h.level));

  return (
    <nav aria-label="Document sections" className="space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Sections
        </h2>
        <span className="text-[11px] text-slate-400">{headings.length}</span>
      </div>

      <ul className="max-h-64 space-y-0.5 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5">
        {headings.map((heading) => {
          const isActive = heading.id === activeHeadingId;
          const indentDepth = Math.min(heading.level - minLevel, 3);
          const paddingLeftClass =
            indentDepth === 0
              ? 'pl-2.5'
              : indentDepth === 1
                ? 'pl-5'
                : indentDepth === 2
                  ? 'pl-7'
                  : 'pl-9';

          return (
            <li key={heading.id}>
              <button
                type="button"
                onClick={() => onSelectHeading(heading.blockIndex)}
                aria-current={isActive ? 'location' : undefined}
                className={`flex w-full items-center gap-2 rounded-lg py-1.5 pr-2.5 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${paddingLeftClass} ${
                  isActive
                    ? 'bg-slate-100 font-semibold text-slate-900'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    isActive ? 'bg-slate-900' : 'bg-transparent'
                  }`}
                />
                <span className="truncate">{heading.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
