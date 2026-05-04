"use client";

export function EditorTabs({
  paths,
  activePath,
  dirtyPaths,
  onSelect,
  onClose,
}: {
  paths: string[];
  activePath: string | null;
  dirtyPaths: Set<string>;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}) {
  if (paths.length === 0) return null;

  return (
    <div className="flex h-8 shrink-0 items-stretch gap-px overflow-x-auto border-b border-[#3c3c3c] bg-[#252526] px-1">
      {paths.map((p) => {
        const active = p === activePath;
        const dirty = dirtyPaths.has(p);
        const name = p.includes("/") ? p.slice(p.lastIndexOf("/") + 1) : p;
        return (
          <div
            key={p}
            className={`group flex min-w-0 max-w-[160px] shrink-0 items-center rounded-t border border-b-0 px-2 text-[12px] ${
              active
                ? "border-[#3c3c3c] border-b-transparent bg-[#1e1e1e] text-[#cccccc]"
                : "border-transparent bg-transparent text-[#969696] hover:bg-[#2a2d2e] hover:text-[#cccccc]"
            }`}
          >
            <button
              type="button"
              title={p}
              onClick={() => onSelect(p)}
              className="min-w-0 flex-1 truncate py-1 text-left"
            >
              {name}
              {dirty ? <span className="ml-0.5 text-[#dcdcaa]">●</span> : null}
            </button>
            <button
              type="button"
              aria-label="Tab schließen"
              className="shrink-0 rounded px-1 py-0.5 text-[#858585] opacity-0 hover:bg-[#3c3c3c] hover:text-[#cccccc] group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onClose(p);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
