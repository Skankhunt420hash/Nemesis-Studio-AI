"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { AgentPanel } from "@/components/AgentPanel";
import { CodeEditor, languageFromPath } from "@/components/CodeEditor";
import { TimeTravelModal } from "@/components/TimeTravelModal";
import { CommandPalette, type PaletteAction } from "@/components/CommandPalette";
import { DiffModal } from "@/components/DiffModal";
import { EditorTabs } from "@/components/EditorTabs";
import { FileTree, type TreeNode } from "@/components/FileTree";
import { ShortcutsModal } from "@/components/ShortcutsModal";
import { StudioOverviewBar } from "@/components/StudioOverviewBar";
import { TerminalPanel } from "@/components/TerminalPanel";
import { MobileAgentPicker } from "@/components/MobileAgentPicker";
import { StudioBootScreen } from "@/components/StudioBootScreen";
import { useResponsiveBreakpoint } from "@/hooks/use-responsive-breakpoint";
import type { AgentProfile } from "@/lib/agent-profile-types";
import { flattenTreeDirs, flattenTreeFiles } from "@/lib/flatten-tree";
import { computeChangedLineNumbers } from "@/lib/diff-line-highlight";
import type { UndoSnapshot } from "@/lib/agent-types";

type McpStatus = { enabled: boolean; connected: boolean; toolCount: number };

type FileBuffer = { content: string; saved: string };

function isModKey(e: KeyboardEvent) {
  return e.metaKey || e.ctrlKey;
}

export default function Home() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [tabOrder, setTabOrder] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [buffers, setBuffers] = useState<Record<string, FileBuffer>>({});
  const [editorStatus, setEditorStatus] = useState<string>("");
  const [diff, setDiff] = useState<{
    path: string;
    original: string;
    modified: string;
  } | null>(null);
  const [mcpStatus, setMcpStatus] = useState<McpStatus | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ line: number; column: number } | null>(
    null
  );
  const [fileHistory, setFileHistory] = useState<Record<string, string[]>>({});
  const [timeTravelOpen, setTimeTravelOpen] = useState(false);
  const [ghostByPath, setGhostByPath] = useState<Record<string, number[]>>({});
  const [verhoerPrefill, setVerhoerPrefill] = useState<{
    socratic: boolean;
    appendix: string;
  } | null>(null);

  const breakpoint = useResponsiveBreakpoint();
  const isMobile = breakpoint === "mobile";
  const [mobilePhase, setMobilePhase] = useState<"agents" | "chat">("agents");
  const [mobilePickedAgent, setMobilePickedAgent] = useState<string | null>(null);
  const [mobileProfiles, setMobileProfiles] = useState<AgentProfile[]>([]);
  const [mobileProfilesLoaded, setMobileProfilesLoaded] = useState(false);
  const [mobileAgentsFetchError, setMobileAgentsFetchError] = useState<string | null>(null);
  const [mobileFilesOpen, setMobileFilesOpen] = useState(false);
  const [mobileTerminalOpen, setMobileTerminalOpen] = useState(false);

  const flatFiles = useMemo(() => flattenTreeFiles(tree), [tree]);
  const flatDirs = useMemo(() => flattenTreeDirs(tree), [tree]);

  const editorContent = activePath ? (buffers[activePath]?.content ?? "") : "";

  const dirtyPaths = useMemo(() => {
    const s = new Set<string>();
    for (const p of tabOrder) {
      const b = buffers[p];
      if (b && b.content !== b.saved) s.add(p);
    }
    return s;
  }, [tabOrder, buffers]);

  const dirty =
    activePath !== null &&
    buffers[activePath] !== undefined &&
    buffers[activePath].content !== buffers[activePath].saved;

  const dirtyCount = dirtyPaths.size;
  const hasGhostHighlight = Boolean(
    activePath && (ghostByPath[activePath]?.length ?? 0) > 0
  );

  const refreshTree = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace");
      const data = (await res.json()) as { tree?: TreeNode[] };
      setTree(data.tree ?? []);
    } catch {
      setTree([]);
    }
  }, []);

  const loadMobileAgentsList = useCallback(async () => {
    setMobileAgentsFetchError(null);
    setMobileProfilesLoaded(false);
    try {
      const res = await fetch("/api/agents");
      const data = (await res.json()) as { agents?: AgentProfile[] };
      if (!res.ok) {
        setMobileProfiles([]);
        setMobileAgentsFetchError(`Agentenliste: HTTP ${res.status}`);
        return;
      }
      setMobileProfiles(data.agents ?? []);
    } catch {
      setMobileProfiles([]);
      setMobileAgentsFetchError("Netzwerkfehler beim Laden von /api/agents.");
    } finally {
      setMobileProfilesLoaded(true);
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void refreshTree();
    });
  }, [refreshTree]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/mcp/status");
        const data = (await res.json()) as McpStatus;
        if (!cancelled) {
          startTransition(() => setMcpStatus(data));
        }
      } catch {
        if (!cancelled) {
          startTransition(() => setMcpStatus(null));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    void loadMobileAgentsList();
  }, [isMobile, loadMobileAgentsList]);

  useEffect(() => {
    if (!isMobile) return;
    const root = document.documentElement;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const y = Math.min(14, window.scrollY * 0.06);
        const x = Math.sin(window.scrollY * 0.01) * 4;
        root.style.setProperty("--nemesis-parallax-y", `${-y}px`);
        root.style.setProperty("--nemesis-parallax-x", `${x}px`);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
      root.style.removeProperty("--nemesis-parallax-y");
      root.style.removeProperty("--nemesis-parallax-x");
    };
  }, [isMobile]);

  const openOrFocusTab = useCallback(async (rel: string) => {
    if (buffers[rel]) {
      setActivePath(rel);
      setTabOrder((o) => (o.includes(rel) ? o : [...o, rel]));
      setEditorStatus("");
      return;
    }
    setActivePath(rel);
    setTabOrder((o) => (o.includes(rel) ? o : [...o, rel]));
    setEditorStatus("Lädt…");
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(rel)}`);
      const data = (await res.json()) as { content?: string; error?: string };
      if (!res.ok) {
        setBuffers((b) => ({
          ...b,
          [rel]: { content: "", saved: "" },
        }));
        setEditorStatus(data.error ?? "Fehler");
        return;
      }
      const c = data.content ?? "";
      setBuffers((b) => ({ ...b, [rel]: { content: c, saved: c } }));
      setEditorStatus("");
    } catch (e) {
      setBuffers((b) => ({
        ...b,
        [rel]: { content: "", saved: "" },
      }));
      setEditorStatus(e instanceof Error ? e.message : String(e));
    }
  }, [buffers]);

  const closeTab = useCallback(
    (p: string) => {
      const b = buffers[p];
      const isDirty = b !== undefined && b.content !== b.saved;
      if (isDirty) {
        const ok = window.confirm(
          `Ungespeicherte Änderungen in „${p}“ verwerfen?`
        );
        if (!ok) return;
      }
      setTabOrder((o) => {
        const idx = o.indexOf(p);
        const next = o.filter((x) => x !== p);
        setActivePath((cur) => {
          if (cur !== p) return cur;
          return next[idx] ?? next[idx - 1] ?? next[0] ?? null;
        });
        return next;
      });
      setBuffers((prev) => {
        const { [p]: removed, ...rest } = prev;
        void removed;
        return rest;
      });
    },
    [buffers]
  );

  const saveFile = useCallback(async () => {
    if (!activePath || !dirty) return;
    const content = buffers[activePath]?.content ?? "";
    setEditorStatus("Speichert…");
    try {
      const res = await fetch("/api/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: activePath, content }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setEditorStatus(data.error ?? "Speichern fehlgeschlagen");
        return;
      }
      setBuffers((b) => ({
        ...b,
        [activePath]: { ...b[activePath], content, saved: content },
      }));
      setEditorStatus("Gespeichert");
      void refreshTree();
      window.setTimeout(() => setEditorStatus(""), 1500);
    } catch (e) {
      setEditorStatus(e instanceof Error ? e.message : String(e));
    }
  }, [activePath, dirty, buffers, refreshTree]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isModKey(e) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveFile();
      }
      if (isModKey(e) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (isModKey(e) && e.key === "/") {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveFile]);

  const paletteActions: PaletteAction[] = useMemo(
    () => [
      {
        id: "save",
        label: "Datei speichern",
        hint: "Strg+S",
        run: () => void saveFile(),
      },
      {
        id: "refresh-tree",
        label: "Explorer aktualisieren",
        run: () => void refreshTree(),
      },
      {
        id: "shortcuts",
        label: "Tastenkürzel anzeigen",
        hint: "Strg+/",
        run: () => setShortcutsOpen(true),
      },
    ],
    [saveFile, refreshTree]
  );

  const afterAgent = useCallback(
    async (opts?: { skipDiff?: boolean; undoSnapshots?: UndoSnapshot[] }) => {
      if (opts?.undoSnapshots?.length) {
        const paths = opts.undoSnapshots
          .map((s) =>
            String(s.path ?? "")
              .replace(/^[/\\]+/, "")
              .replace(/\\/g, "/")
              .trim()
          )
          .filter(Boolean);
        setFileHistory((h) => {
          const next = { ...h };
          for (const p of paths) {
            const arr = [...(next[p] ?? [])];
            if (arr.length) arr.pop();
            if (arr.length === 0) delete next[p];
            else next[p] = arr;
          }
          return next;
        });
      }
      const path = activePath;
      const before = path ? buffers[path]?.content ?? null : null;
      await refreshTree();
      if (!path) return;
      try {
        const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
        const data = (await res.json()) as { content?: string; error?: string };
        if (!res.ok) return;
        const after = data.content ?? "";
        setBuffers((b) => ({
          ...b,
          [path]: { content: after, saved: after },
        }));
        if (!opts?.skipDiff && before !== null && before !== after) {
          setDiff({ path, original: before, modified: after });
          setFileHistory((h) => {
            const prev = h[path] ?? [];
            const next = [...prev, before];
            if (next.length > 40) next.splice(0, next.length - 40);
            return { ...h, [path]: next };
          });
          setGhostByPath((g) => ({
            ...g,
            [path]: computeChangedLineNumbers(before, after),
          }));
        }
        if (opts?.skipDiff) {
          setGhostByPath((g) => {
            if (!g[path]) return g;
            const { [path]: _rm, ...rest } = g;
            void _rm;
            return rest;
          });
        }
      } catch {
        /* ignore */
      }
      try {
        const res = await fetch("/api/mcp/status");
        setMcpStatus((await res.json()) as McpStatus);
      } catch {
        /* ignore */
      }
    },
    [refreshTree, activePath, buffers]
  );

  const langLabel = activePath ? languageFromPath(activePath) : "—";

  if (breakpoint === "pending") {
    return <StudioBootScreen />;
  }

  if (isMobile) {
    return (
      <>
        {mobilePhase === "agents" ? (
          <MobileAgentPicker
            profiles={mobileProfiles}
            loading={!mobileProfilesLoaded && mobileProfiles.length === 0 && !mobileAgentsFetchError}
            fetchError={mobileAgentsFetchError}
            onRetryFetch={() => void loadMobileAgentsList()}
            onSelect={(id) => {
              setMobilePickedAgent(id);
              setMobilePhase("chat");
            }}
          />
        ) : (
          <div className="nemesis-fun-bg relative flex h-[100dvh] flex-col overflow-hidden">
            <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
              <div
                className="nemesis-parallax-soft absolute -left-[25%] top-[-20%] h-[60vmin] w-[60vmin] rounded-full opacity-80 blur-[70px]"
                style={{
                  background:
                    "radial-gradient(circle, rgba(167, 139, 250, 0.9), rgba(91, 33, 182, 0.35) 55%, transparent 72%)",
                }}
              />
              <div
                className="nemesis-parallax-soft absolute -right-[20%] bottom-[-15%] h-[55vmin] w-[55vmin] rounded-full opacity-85 blur-[64px]"
                style={{
                  background:
                    "radial-gradient(circle, rgba(253, 224, 71, 0.85), rgba(217, 119, 6, 0.4) 50%, transparent 70%)",
                }}
              />
              <div className="absolute inset-0 bg-[#ffe45e]/75" />
              <div className="nemesis-float-layer nemesis-parallax-soft">
                <span className="nemesis-float-bubble left-[6%] top-[15%] h-8 w-8 [--dur:6.4s]" />
                <span className="nemesis-float-bubble left-[16%] top-[54%] h-5 w-5 [--dur:7.3s]" />
                <span className="nemesis-float-bubble left-[34%] top-[78%] h-9 w-9 [--dur:6.9s]" />
                <span className="nemesis-float-bubble left-[52%] top-[22%] h-7 w-7 [--dur:8.2s]" />
                <span className="nemesis-float-bubble left-[69%] top-[58%] h-10 w-10 [--dur:6.1s]" />
                <span className="nemesis-float-bubble left-[82%] top-[34%] h-6 w-6 [--dur:7.8s]" />
                <span className="nemesis-float-bubble left-[90%] top-[74%] h-4 w-4 [--dur:8.5s]" />
              </div>
            </div>
            <AgentPanel
              layout="mobile"
              mobilePickedAgentId={mobilePickedAgent}
              onMobileBack={() => setMobilePhase("agents")}
              onMobileOpenFiles={() => setMobileFilesOpen(true)}
              onMobileOpenTerminal={() => setMobileTerminalOpen(true)}
              onAfterAgentRun={afterAgent}
              onAfterUndo={(snaps) => void afterAgent({ skipDiff: true, undoSnapshots: snaps })}
              onWorkspaceUploaded={() => void refreshTree()}
              activeFilePath={activePath}
              workspaceFiles={flatFiles}
              workspaceDirs={flatDirs}
              verhoerPrefill={verhoerPrefill}
              onConsumeVerhoerPrefill={() => setVerhoerPrefill(null)}
            />

            <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#7c3aed]/30 bg-[#fff4bf]/90 px-2 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-xl">
              <div className="mx-auto grid w-full max-w-md grid-cols-4 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setMobileFilesOpen(false);
                    setMobileTerminalOpen(false);
                  }}
                  className="nemesis-bubble-btn rounded-xl px-2 py-2 text-[11px] font-medium text-[#7c3aed] hover:bg-[#f9a8d4]/40"
                >
                  Chat
                </button>
                <button
                  type="button"
                  onClick={() => setMobileFilesOpen(true)}
                  className={`nemesis-bubble-btn rounded-xl px-2 py-2 text-[11px] font-medium ${
                    mobileFilesOpen
                      ? "bg-[#ec4899]/20 text-[#ec4899] ring-1 ring-[#ec4899]/50"
                      : "text-[#7c3aed] hover:bg-[#f9a8d4]/40"
                  }`}
                >
                  Dateien
                </button>
                <button
                  type="button"
                  onClick={() => setMobileTerminalOpen(true)}
                  className={`nemesis-bubble-btn rounded-xl px-2 py-2 text-[11px] font-medium ${
                    mobileTerminalOpen
                      ? "bg-[#ec4899]/20 text-[#ec4899] ring-1 ring-[#ec4899]/50"
                      : "text-[#7c3aed] hover:bg-[#f9a8d4]/40"
                  }`}
                >
                  Terminal
                </button>
                <button
                  type="button"
                  onClick={() => setMobilePhase("agents")}
                  className="nemesis-bubble-btn rounded-xl px-2 py-2 text-[11px] font-medium text-[#7c3aed] hover:bg-[#f9a8d4]/40"
                >
                  Agenten
                </button>
              </div>
            </nav>
          </div>
        )}

        {mobileFilesOpen ? (
          <div
            className="fixed inset-0 z-[60] flex flex-col bg-[#0c0615]/96 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label="Workspace-Dateien"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <span className="text-[15px] font-semibold text-white">Datei aus Workspace</span>
              <button
                type="button"
                onClick={() => setMobileFilesOpen(false)}
                className="rounded-full border border-white/20 px-3 py-1 text-[13px] text-white"
              >
                Fertig
              </button>
            </div>
            <p className="px-3 py-2 text-[11px] leading-snug text-amber-200/85">
              Tippe eine Datei — sie wird fokussiert; im Chat unter Einstellungen kannst du sie als
              Kontext anhängen („Offene Datei“).
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="rounded-xl border border-violet-500/25 bg-[#1a1425]/90 p-1">
                <FileTree
                  tree={tree}
                  onSelectFile={(p) => {
                    void openOrFocusTab(p);
                    setMobileFilesOpen(false);
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}

        {mobileTerminalOpen ? (
          <div
            className="fixed inset-0 z-[61] flex flex-col bg-[#0c0615]/96 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label="Terminal"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <span className="text-[15px] font-semibold text-white">Terminal</span>
              <button
                type="button"
                onClick={() => setMobileTerminalOpen(false)}
                className="rounded-full border border-white/20 px-3 py-1 text-[13px] text-white"
              >
                Fertig
              </button>
            </div>
            <p className="px-3 py-2 text-[11px] leading-snug text-cyan-200/85">
              Voller Terminal-Modus auf Mobile. Bei Verbindungsproblemen kurz neu starten.
            </p>
            <div className="min-h-0 flex-1 overflow-hidden px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
              <div className="h-full overflow-hidden rounded-xl border border-cyan-500/30 bg-[#111118]">
                <TerminalPanel />
              </div>
            </div>
          </div>
        ) : null}

        {diff ? (
          <DiffModal
            open
            path={diff.path}
            original={diff.original}
            modified={diff.modified}
            onClose={() => setDiff(null)}
            onVerhoer={(p) => setVerhoerPrefill(p)}
          />
        ) : null}
      </>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#1e1e1e] font-sans text-[#cccccc]">
      <header className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#3c3c3c] bg-[#1e1e1e] px-3 py-1.5">
        <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-[15px] font-semibold tracking-tight text-[#ffffff]">
              Nemesis Studio
            </span>
            <span className="shrink-0 rounded border border-[#007acc]/40 bg-[#007acc]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#9cdcfe]">
              KI-Agent
            </span>
          </div>
          <span className="hidden text-[11px] text-[#858585] sm:inline">
            Editor · Workspace · Chat — alles an einem Ort
          </span>
          <span className="text-[10px] text-[#858585] sm:hidden">
            Editor · Agent · Terminal
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="rounded border border-transparent px-2 py-1 text-[12px] text-[#cccccc] hover:border-[#3c3c3c] hover:bg-[#2a2d2e]"
            title="Strg+P"
          >
            Schnellzugriff
          </button>
          <button
            type="button"
            onClick={() => void saveFile()}
            disabled={!activePath || !dirty}
            className="rounded bg-[#0e639c] px-2.5 py-1 text-[12px] font-medium text-white hover:bg-[#1177bb] disabled:cursor-not-allowed disabled:bg-[#3c3c3c] disabled:opacity-50"
          >
            Speichern
          </button>
          <button
            type="button"
            onClick={() => void refreshTree()}
            className="rounded px-2 py-1 text-[12px] text-[#858585] hover:bg-[#2a2d2e] hover:text-[#cccccc]"
          >
            Explorer aktualisieren
          </button>
          <button
            type="button"
            disabled={!activePath}
            onClick={() => setTimeTravelOpen(true)}
            className="rounded px-2 py-1 text-[12px] text-[#cccccc] hover:bg-[#2a2d2e] disabled:cursor-not-allowed disabled:opacity-35"
            title="Snapshots dieser Datei durchblättern"
          >
            Zeitreise
          </button>
        </div>
      </header>

      <StudioOverviewBar
        activePath={activePath}
        openTabsCount={tabOrder.length}
        dirtyCount={dirtyCount}
        hasGhostHighlight={hasGhostHighlight}
        mcpStatus={mcpStatus}
        workspaceFileCount={flatFiles.length}
      />

      <Group orientation="horizontal" className="min-h-0 flex-1">
        <Panel
          id="explorer"
          defaultSize={16}
          minSize={10}
          maxSize={35}
          className="min-w-0"
        >
          <aside className="flex h-full flex-col border-r border-[#3c3c3c] bg-[#252526]">
            <div className="shrink-0 border-b border-[#3c3c3c] px-2 py-1.5 leading-tight">
              <div className="text-[12px] font-semibold text-[#cccccc]">Explorer</div>
              <div className="text-[10px] text-[#858585]">Workspace-Dateien wählen</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <FileTree tree={tree} onSelectFile={(p) => void openOrFocusTab(p)} />
            </div>
            <div className="shrink-0 border-t border-[#3c3c3c] px-2 py-1.5 text-[10px] leading-snug text-[#858585]">
              <span className="font-medium text-[#bbbbbb]">Ordner</span>{" "}
              <span className="font-mono text-[#569cd6]">agent-workspace</span>
            </div>
          </aside>
        </Panel>

        <Separator className="group relative w-px shrink-0 bg-[#3c3c3c] outline-none after:absolute after:inset-y-0 after:-left-1 after:-right-1 after:content-[''] hover:bg-[#007fd4] focus-visible:bg-[#007fd4]" />

        <Panel id="editor" defaultSize={54} minSize={35} className="min-w-0">
          <Group orientation="vertical" className="h-full min-h-0">
            <Panel defaultSize={72} minSize={35} className="min-h-0">
              <main className="flex h-full min-w-0 flex-1 flex-col bg-[#1e1e1e]">
                <div className="flex shrink-0 items-center justify-between border-b border-[#3c3c3c] bg-[#252526] px-2 py-1">
                  <div>
                    <span className="text-[12px] font-semibold text-[#cccccc]">Editor</span>
                    <span className="ml-2 text-[10px] text-[#858585]">Code · Tabs · Status</span>
                  </div>
                </div>
                <EditorTabs
                  paths={tabOrder}
                  activePath={activePath}
                  dirtyPaths={dirtyPaths}
                  onSelect={(p) => void openOrFocusTab(p)}
                  onClose={(p) => closeTab(p)}
                />
                <div className="flex h-8 shrink-0 items-center justify-between border-b border-[#3c3c3c] px-3 text-[11px] text-[#858585]">
                  <div className="min-w-0 truncate">
                    {activePath ? (
                      <span className="font-mono text-[#cccccc]">{activePath}</span>
                    ) : (
                      <span>Keine Datei geöffnet</span>
                    )}
                    {dirty ? (
                      <span className="ml-2 text-[#dcdcaa]">· ungespeichert</span>
                    ) : null}
                  </div>
                  {editorStatus ? (
                    <span className="shrink-0 text-[#569cd6]">{editorStatus}</span>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1">
                  <CodeEditor
                    path={activePath}
                    value={editorContent}
                    ghostLineNumbers={
                      activePath && ghostByPath[activePath]?.length
                        ? ghostByPath[activePath]
                        : null
                    }
                    onChange={(v) => {
                      if (!activePath) return;
                      setGhostByPath((g) => {
                        if (!g[activePath]) return g;
                        const { [activePath]: _rm, ...rest } = g;
                        void _rm;
                        return rest;
                      });
                      setBuffers((b) => ({
                        ...b,
                        [activePath]: {
                          content: v,
                          saved: b[activePath]?.saved ?? "",
                        },
                      }));
                    }}
                    onCursorPosition={setCursorPos}
                  />
                </div>
                <footer className="flex h-6 shrink-0 items-center justify-between border-t border-[#3c3c3c] bg-[#007acc]/15 px-3 text-[11px] text-[#cccccc]">
                  <span className="font-mono text-[#569cd6]">
                    {activePath ? langLabel : "Bereit"}
                  </span>
                  <span className="text-[#858585]">
                    Zeile {cursorPos?.line ?? "—"}, Spalte {cursorPos?.column ?? "—"} · UTF-8
                  </span>
                </footer>
              </main>
            </Panel>

            <Separator className="h-px shrink-0 bg-[#3c3c3c] hover:bg-[#007fd4]" />

            <Panel defaultSize={28} minSize={16} maxSize={65} className="min-h-0">
              <TerminalPanel />
            </Panel>
          </Group>
        </Panel>

        <Separator className="group relative w-px shrink-0 bg-[#3c3c3c] outline-none after:absolute after:inset-y-0 after:-left-1 after:-right-1 after:content-[''] hover:bg-[#007fd4] focus-visible:bg-[#007fd4]" />

        <Panel id="agent" defaultSize={30} minSize={22} maxSize={55} className="min-w-0">
          <AgentPanel
            onAfterAgentRun={afterAgent}
            onAfterUndo={(snaps) => void afterAgent({ skipDiff: true, undoSnapshots: snaps })}
            onWorkspaceUploaded={() => void refreshTree()}
            activeFilePath={activePath}
            workspaceFiles={flatFiles}
            workspaceDirs={flatDirs}
            verhoerPrefill={verhoerPrefill}
            onConsumeVerhoerPrefill={() => setVerhoerPrefill(null)}
          />
        </Panel>
      </Group>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        files={flatFiles}
        onOpenFile={(p) => void openOrFocusTab(p)}
        actions={paletteActions}
      />
      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      {diff ? (
        <DiffModal
          open
          path={diff.path}
          original={diff.original}
          modified={diff.modified}
          onClose={() => setDiff(null)}
          onVerhoer={(p) => setVerhoerPrefill(p)}
        />
      ) : null}

      {timeTravelOpen && activePath ? (
        <TimeTravelModal
          open
          path={activePath}
          versions={fileHistory[activePath] ?? []}
          currentContent={buffers[activePath]?.content ?? ""}
          onClose={() => setTimeTravelOpen(false)}
        />
      ) : null}
    </div>
  );
}
