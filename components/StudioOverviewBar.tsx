"use client";

type Mcp = { enabled: boolean; connected: boolean; toolCount: number } | null;

export function StudioOverviewBar({
  activePath,
  openTabsCount,
  dirtyCount,
  hasGhostHighlight,
  mcpStatus,
  workspaceFileCount,
}: {
  activePath: string | null;
  openTabsCount: number;
  dirtyCount: number;
  hasGhostHighlight: boolean;
  mcpStatus: Mcp;
  workspaceFileCount: number;
}) {
  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[#007acc]/25 bg-[#252526] px-3 py-2 text-[11px]"
      role="region"
      aria-label="Studio-Übersicht"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 rounded bg-[#007acc]/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#9cdcfe]">
          Übersicht
        </span>
        <span className="min-w-0 truncate text-[#cccccc]" title={activePath ?? undefined}>
          <span className="text-[#858585]">Datei:</span>{" "}
          <span className="font-mono text-[#4ec9b0]">
            {activePath ?? "— keine geöffnet —"}
          </span>
        </span>
      </div>
      <span className="hidden h-3 w-px bg-[#454545] sm:inline" aria-hidden />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[#858585]">
        <span title="Geöffnete Editor-Tabs">
          Tabs: <strong className="text-[#cccccc]">{openTabsCount}</strong>
        </span>
        <span title="Ungespeicherte Dateien">
          Speichern:{" "}
          <strong className={dirtyCount > 0 ? "text-[#dcdcaa]" : "text-[#6a9955]"}>
            {dirtyCount > 0 ? `${dirtyCount} offen` : "alles gespeichert"}
          </strong>
        </span>
        {hasGhostHighlight ? (
          <span className="rounded bg-[#dcdcaa]/15 px-1.5 text-[#dcdcaa]" title="Zeilen nach letztem Agent-Diff">
            Diff-Markierung aktiv
          </span>
        ) : null}
        <span title="Dateien im Workspace (ungefähr)">
          Workspace:{" "}
          <strong className="font-mono text-[#569cd6]">{workspaceFileCount}</strong> Dateien
        </span>
        {mcpStatus?.enabled ? (
          <span>
            MCP:{" "}
            <strong
              className={
                mcpStatus.connected ? "text-[#4ec9b0]" : "text-[#dcdcaa]"
              }
            >
              {mcpStatus.connected ? `verbunden (${mcpStatus.toolCount})` : "ausstehend"}
            </strong>
          </span>
        ) : (
          <span className="text-[#6a6a6a]">MCP: aus</span>
        )}
      </div>
    </div>
  );
}
