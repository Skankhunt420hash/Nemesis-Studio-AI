"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentStreamEvent,
  AgentTraceEntry,
  UndoSnapshot,
} from "@/lib/agent-types";
import type { AgentProfile } from "@/lib/agent-profile-types";
import { FALLBACK_DEFAULT_AGENT_ID } from "@/lib/agent-profile-types";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import { BugHunterArenaPanel } from "@/components/BugHunterArenaPanel";
import { CouncilPanel } from "@/components/CouncilPanel";
import { GeniusToolbox } from "@/components/GeniusToolbox";
import { TradeAnalysisPanel } from "@/components/TradeAnalysisPanel";
import { SoulMemoryPanel } from "@/components/SoulMemoryPanel";
import type { ChatThread, ChatThreadsStore } from "@/lib/chat-threads-storage";
import {
  genThreadId,
  loadChatThreads,
  saveChatThreads,
  titleFromMessages,
} from "@/lib/chat-threads-storage";
import type { ContextAttachment } from "@/lib/agent-context-pack";
import {
  WORKSPACE_DRAG_MIME,
  type WorkspaceDragPayload,
} from "@/lib/dnd-workspace";
import type { SoulMemoryState } from "@/lib/soul-memory-types";
import { emptySoulMemory } from "@/lib/soul-memory-types";
import { loadSoulMemoryFromBrowser, saveSoulMemoryToBrowser } from "@/lib/soul-memory-storage";
import { CLIENT_MAX_DROP_BYTES } from "@/lib/workspace-upload-limits";

type ChatMessage = { role: "user" | "assistant"; content: string };
type ApiMsg = { role: "user" | "assistant"; content: string };

const STALL_MS = 90_000;
const MAX_STALL_RECOVERIES = 2;

const STALL_DIAG_PREFIX =
  "[META — Selbst-Diagnose — stille Spur] Der Antwort-Stream stagnierte (lange keine Daten). " +
  "Kurz einschätzen, was schieflaufen könnte; Workspace mit list_directory/read_file/grep prüfen; " +
  "die gleiche Nutzeraufgabe mit dem kleinsten sinnvollen nächsten Schritt fortsetzen. " +
  "Keine fehlgeschlagenen Tool-Calls identisch wiederholen.";

const SCRATCH_LS = "nemesis_scratch_pad";

function buildStallDiag(extraTrace: string): string {
  const t = extraTrace.trim();
  return `${STALL_DIAG_PREFIX}${t ? `\n\n[Kompakt-Trace zuletzt ausgeführt: ${t}]` : ""}`;
}

function patchActive(
  s: ChatThreadsStore,
  recipe: (thread: ChatThread) => ChatThread
): ChatThreadsStore {
  const threads = s.threads.map((t) => (t.id === s.activeId ? recipe(t) : t));
  return { ...s, threads };
}

function TraceBlock({ entry }: { entry: AgentTraceEntry }) {
  if (entry.kind === "assistant_text") {
    return (
      <div className="rounded-lg border border-[#3c3c3c] bg-[#252526] px-3 py-2 text-[13px] leading-relaxed text-[#d4d4d4] whitespace-pre-wrap">
        {entry.content}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-[#3c3c3c] bg-[#1e1e1e] p-2">
      {entry.summary ? (
        <p className="px-1 text-[12px] text-[#858585]">{entry.summary}</p>
      ) : null}
      {entry.calls.map((c) => (
        <div
          key={c.id}
          className="rounded border border-[#454545] bg-[#252526] font-mono text-[12px]"
        >
          <div className="flex items-center gap-2 border-b border-[#454545] px-2 py-1 text-[#569cd6]">
            <span className="text-[#dcdcaa]">{c.name}</span>
          </div>
          <pre className="max-h-32 overflow-auto border-b border-[#454545] px-2 py-1 text-[#ce9178]">
            {c.arguments}
          </pre>
          <pre className="max-h-40 overflow-auto px-2 py-1 text-[#b5cea8] whitespace-pre-wrap">
            {c.result}
          </pre>
        </div>
      ))}
    </div>
  );
}

type ChatImageWire = { mime: string; base64: string };

const MAX_VISION_INLINE_BYTES = 1_750_000;

type MinimalSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

export function AgentPanel({
  onAfterAgentRun,
  onAfterUndo,
  onWorkspaceUploaded,
  activeFilePath,
  workspaceFiles = [],
  workspaceDirs = [],
  verhoerPrefill,
  onConsumeVerhoerPrefill,
}: {
  onAfterAgentRun?: () => void;
  /** Nach erfolgreichem Rückgängig: Workspace/Editor neu laden; Snapshots für Zeitreise-Korrektur. */
  onAfterUndo?: (snapshots: UndoSnapshot[]) => void;
  /** Nach Upload per Drag & Drop (OS-Dateien) Explorer aktualisieren. */
  onWorkspaceUploaded?: () => void;
  activeFilePath?: string | null;
  workspaceFiles?: string[];
  workspaceDirs?: string[];
  /** Aus Diff-Modal „Verhör“: nächste Nachricht anreichern + Socratic aktivieren. */
  verhoerPrefill?: { socratic: boolean; appendix: string } | null;
  onConsumeVerhoerPrefill?: () => void;
}) {
  const [threadStore, setThreadStore] = useState<ChatThreadsStore | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTrace, setLastTrace] = useState<AgentTraceEntry[] | null>(null);
  const [streamingDraft, setStreamingDraft] = useState<string | null>(null);
  const [liveToolRounds, setLiveToolRounds] = useState<
    Extract<AgentTraceEntry, { kind: "tool_round" }>[]
  >([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const acRef = useRef<AbortController | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryAttemptsRef = useRef(0);
  const isStallAbortRef = useRef(false);
  const agentIdRef = useRef(FALLBACK_DEFAULT_AGENT_ID);
  const stallToolTraceRef = useRef("");

  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [agentId, setAgentId] = useState("");
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [localHint, setLocalHint] = useState<string | null>(null);
  const [contextAttachments, setContextAttachments] = useState<ContextAttachment[]>(
    []
  );
  const [pickFile, setPickFile] = useState("");
  const [pickDir, setPickDir] = useState("");
  const [dropHighlight, setDropHighlight] = useState(false);
  const [dropBusy, setDropBusy] = useState(false);
  const dragNestRef = useRef(0);
  const filePickRef = useRef<HTMLInputElement>(null);
  const [lastUndoSnapshots, setLastUndoSnapshots] = useState<UndoSnapshot[] | null>(
    null
  );
  const [undoBusy, setUndoBusy] = useState(false);
  const [socraticDiff, setSocraticDiff] = useState(false);
  const [scratchPad, setScratchPad] = useState("");
  const [headphoneMode, setHeadphoneMode] = useState(false);
  const [pendingImages, setPendingImages] = useState<ChatImageWire[]>([]);
  const [sttActive, setSttActive] = useState(false);
  const [soulMemory, setSoulMemory] = useState<SoulMemoryState>(() => emptySoulMemory());
  const soulMemoryRef = useRef<SoulMemoryState>(emptySoulMemory());
  const lastUserForSoulRef = useRef("");

  /* eslint-disable react-hooks/set-state-in-effect -- Chat-Verläufe aus localStorage nach Client-Mount */
  useEffect(() => {
    setThreadStore(loadChatThreads());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    setSoulMemory(loadSoulMemoryFromBrowser());
  }, []);

  useEffect(() => {
    soulMemoryRef.current = soulMemory;
  }, [soulMemory]);

  useEffect(() => {
    if (threadStore) saveChatThreads(threadStore);
  }, [threadStore]);

  useEffect(() => {
    try {
      const s = localStorage.getItem(SCRATCH_LS);
      if (s) setScratchPad(s);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SCRATCH_LS, scratchPad);
    } catch {
      /* ignore */
    }
  }, [scratchPad]);

  const activeThread = threadStore?.threads.find((t) => t.id === threadStore.activeId);
  const messages = activeThread?.messages ?? [];

  const getLastUserMessage = useCallback((): string | null => {
    if (!threadStore) return null;
    const t = threadStore.threads.find((x) => x.id === threadStore.activeId);
    if (!t?.messages.length) return null;
    const u = [...t.messages].reverse().find((m) => m.role === "user");
    const c = u?.content?.trim();
    return c || null;
  }, [threadStore]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/agents");
        const data = (await res.json()) as {
          agents?: AgentProfile[];
          defaultAgentId?: string;
        };
        if (cancelled) return;
        const list = data.agents ?? [];
        setProfiles(list);
        if (list.length === 0) return;
        let pick = data.defaultAgentId ?? list[0].id;
        if (!list.some((p) => p.id === pick)) pick = list[0].id;
        try {
          const s = localStorage.getItem("nemesis_agent_id");
          if (s && list.some((p) => p.id === s)) pick = s;
        } catch {
          /* ignore */
        }
        setAgentId(pick);
        agentIdRef.current = pick;
      } catch {
        if (!cancelled) setProfiles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    agentIdRef.current = agentId || FALLBACK_DEFAULT_AGENT_ID;
  }, [agentId]);

  useEffect(() => {
    if (!agentId) return;
    try {
      localStorage.setItem("nemesis_agent_id", agentId);
    } catch {
      /* ignore */
    }
  }, [agentId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/llm/local-models");
        const data = (await res.json()) as {
          models?: string[];
          hint?: string;
        };
        if (cancelled) return;
        setLocalModels(data.models ?? []);
        setLocalHint(data.hint ?? null);
      } catch {
        if (!cancelled) setLocalModels([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeProfile = profiles.find((p) => p.id === agentId) ?? profiles[0];

  const cancel = useCallback(() => {
    isStallAbortRef.current = false;
    abortRef.current?.abort();
  }, []);

  const clearStallWatchdog = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearStallWatchdog(), [clearStallWatchdog]);

  const newThread = useCallback(() => {
    const id = genThreadId();
    setThreadStore((s) => {
      const base = s ?? loadChatThreads();
      return {
        activeId: id,
        threads: [
          { id, title: "Neuer Chat", messages: [], updatedAt: Date.now() },
          ...base.threads,
        ].slice(0, 48),
      };
    });
    setLastTrace(null);
    setError(null);
    setStreamingDraft(null);
    setLiveToolRounds([]);
    setContextAttachments([]);
    setPickFile("");
    setPickDir("");
  }, []);

  const switchThread = useCallback((id: string) => {
    setThreadStore((s) => {
      if (!s || !s.threads.some((t) => t.id === id)) return s;
      return { ...s, activeId: id };
    });
    setLastTrace(null);
    setError(null);
    setStreamingDraft(null);
    setLiveToolRounds([]);
    setContextAttachments([]);
    setPickFile("");
    setPickDir("");
  }, []);

  const addContext = useCallback((kind: ContextAttachment["kind"], path: string) => {
    const p = path.replace(/^[/\\]+/, "").replace(/\\/g, "/").trim();
    if (!p) return;
    setContextAttachments((prev) => {
      if (prev.some((x) => x.path === p && x.kind === kind)) return prev;
      return [...prev, { path: p, kind }];
    });
  }, []);

  const removeContext = useCallback((path: string, kind: ContextAttachment["kind"]) => {
    setContextAttachments((prev) => prev.filter((x) => !(x.path === path && x.kind === kind)));
  }, []);

  const appendLocalFileAsVisionIfImage = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) return;
    if (f.size > MAX_VISION_INLINE_BYTES) return;
    const reader = new FileReader();
    reader.onload = () => {
      const r = String(reader.result ?? "");
      const m = /^data:([^;]+);base64,(.+)$/.exec(r);
      if (m) {
        setPendingImages((p) => {
          if (p.length >= 6) return p;
          return [...p, { mime: m[1], base64: m[2] }];
        });
      }
    };
    reader.readAsDataURL(f);
  }, []);

  const ingestExternalFiles = useCallback(
    async (fileList: File[]) => {
      if (!fileList.length) return;
      setDropBusy(true);
      setError(null);
      try {
        let anyOk = false;
        for (const f of fileList) {
          if (f.size > CLIENT_MAX_DROP_BYTES) {
            setError(
              `Datei zu groß: „${f.name}“ (über ${Math.round(CLIENT_MAX_DROP_BYTES / (1024 * 1024))} MB).`
            );
            continue;
          }
          const fd = new FormData();
          fd.append("file", f);
          const res = await fetch("/api/workspace/drop", { method: "POST", body: fd });
          const data = (await res.json()) as { path?: string; error?: string };
          if (res.ok && data.path) {
            addContext("file", data.path);
            appendLocalFileAsVisionIfImage(f);
            anyOk = true;
          } else if (data.error) {
            setError(data.error);
          }
        }
        if (anyOk) onWorkspaceUploaded?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setDropBusy(false);
      }
    },
    [addContext, onWorkspaceUploaded, appendLocalFileAsVisionIfImage]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragNestRef.current += 1;
    setDropHighlight(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragNestRef.current = Math.max(0, dragNestRef.current - 1);
    if (dragNestRef.current === 0) setDropHighlight(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragNestRef.current = 0;
      setDropHighlight(false);

      const raw = e.dataTransfer.getData(WORKSPACE_DRAG_MIME);
      if (raw) {
        try {
          const p = JSON.parse(raw) as WorkspaceDragPayload;
          if (
            p &&
            typeof p.path === "string" &&
            (p.kind === "file" || p.kind === "dir")
          ) {
            addContext(p.kind, p.path);
          }
        } catch {
          /* ignore */
        }
        return;
      }

      const list = e.dataTransfer.files;
      if (!list?.length) return;
      await ingestExternalFiles(Array.from(list));
    },
    [addContext, ingestExternalFiles]
  );

  function exportActiveThread() {
    if (!threadStore) return;
    const t = threadStore.threads.find((x) => x.id === threadStore.activeId);
    if (!t?.messages.length) return;
    const blob = new Blob([JSON.stringify(t, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nemesis-chat-${t.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const speakAssistant = useCallback((text: string) => {
    if (!headphoneMode || typeof window === "undefined") return;
    const syn = window.speechSynthesis;
    if (!syn) return;
    syn.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 12_000));
    u.lang = "de-DE";
    syn.speak(u);
  }, [headphoneMode]);

  const startStt = useCallback(() => {
    if (typeof window === "undefined") return;
    const W = window as unknown as {
      SpeechRecognition?: new () => MinimalSpeechRecognition;
      webkitSpeechRecognition?: new () => MinimalSpeechRecognition;
    };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) {
      setError("Spracherkennung wird von diesem Browser nicht unterstützt.");
      return;
    }
    const rec = new Ctor();
    rec.lang = "de-DE";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (ev) => {
      const t = ev.results[0]?.[0]?.transcript?.trim();
      if (t) setInput((prev) => (prev ? `${prev} ${t}` : t));
    };
    rec.onerror = () => setSttActive(false);
    rec.onend = () => setSttActive(false);
    setSttActive(true);
    rec.start();
  }, []);

  const send = useCallback(async () => {
    let text = input.trim();
    if (!text || loading || !threadStore) return;

    let socratic = socraticDiff;
    if (verhoerPrefill?.appendix) {
      text = `${text}\n\n---\n\n${verhoerPrefill.appendix}`;
      if (verhoerPrefill.socratic) socratic = true;
      onConsumeVerhoerPrefill?.();
    }

    lastUserForSoulRef.current = text;

    setInput("");
    setError(null);
    setLastTrace(null);
    setStreamingDraft("");
    setLiveToolRounds([]);

    const nextUser: ChatMessage = { role: "user", content: text };
    stallToolTraceRef.current = "";
    let payload: ApiMsg[] = [];

    setThreadStore((s) => {
      if (!s) return s;
      return patchActive(s, (t) => {
        const nm = [...t.messages, nextUser];
        payload = nm.map((m) => ({ role: m.role, content: m.content }));
        const title =
          t.title === "Neuer Chat" ? titleFromMessages(nm) : t.title;
        return { ...t, messages: nm, title, updatedAt: Date.now() };
      });
    });

    setLoading(true);
    recoveryAttemptsRef.current = 0;

    const resetStallWatchdog = () => {
      clearStallWatchdog();
      stallTimerRef.current = setTimeout(() => {
        stallTimerRef.current = null;
        if (recoveryAttemptsRef.current >= MAX_STALL_RECOVERIES) {
          setError(
            `Kein Fortschritt seit ${STALL_MS / 1000}s (nach ${MAX_STALL_RECOVERIES} Selbst-Korrekturen). Bitte erneut versuchen oder Aufgabe kürzen.`
          );
          isStallAbortRef.current = false;
          acRef.current?.abort();
          return;
        }
        recoveryAttemptsRef.current += 1;
        isStallAbortRef.current = true;
        acRef.current?.abort();
      }, STALL_MS);
    };

    attempts: while (true) {
      const ac = new AbortController();
      abortRef.current = ac;
      acRef.current = ac;
      setStreamingDraft("");
      setLiveToolRounds([]);

      let sawDone = false;
      let streamError: string | null = null;
      let sawCancelled = false;
      let fetchAborted = false;

      resetStallWatchdog();

      try {
        const scratchSnippets = scratchPad.trim() ? [scratchPad.trim()] : [];
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: payload,
            stream: true,
            agentId: agentIdRef.current,
            contextAttachments:
              contextAttachments.length > 0 ? contextAttachments : undefined,
            socraticDiff: socratic || undefined,
            scratchSnippets: scratchSnippets.length ? scratchSnippets : undefined,
            images: pendingImages.length ? pendingImages : undefined,
            soulMemory,
          }),
          signal: ac.signal,
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(data.error ?? `HTTP ${res.status}`);
          break attempts;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setError("Kein Antwort-Stream vom Server.");
          break attempts;
        }

        const dec = new TextDecoder();
        let buf = "";
        let finalMessage = "";

        readLoop: while (true) {
          let readResult;
          try {
            readResult = await reader.read();
          } catch {
            if (!isStallAbortRef.current) fetchAborted = true;
            break readLoop;
          }
          const { done, value } = readResult;
          if (done) break;
          resetStallWatchdog();
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;

            let ev: AgentStreamEvent;
            try {
              ev = JSON.parse(line) as AgentStreamEvent;
            } catch {
              continue;
            }

            resetStallWatchdog();

            if (ev.type === "assistant_delta") {
              setStreamingDraft((d) => (d ?? "") + ev.text);
            } else if (ev.type === "tool_round") {
              stallToolTraceRef.current = ev.calls
                .map((c) => c.name)
                .filter(Boolean)
                .slice(-12)
                .join(", ");
              setLiveToolRounds((r) => [
                ...r,
                {
                  kind: "tool_round",
                  summary: ev.summary,
                  calls: ev.calls,
                },
              ]);
            } else if (ev.type === "heartbeat") {
              /* Uhr wird oben zurückgesetzt */
            } else if (ev.type === "done") {
              sawDone = true;
              finalMessage = ev.finalMessage;
              setLastTrace(ev.trace);
              const content = finalMessage || "(ohne Textantwort)";
              setLastUndoSnapshots(
                ev.undoSnapshots && ev.undoSnapshots.length > 0
                  ? ev.undoSnapshots
                  : null
              );
              setPendingImages([]);
              setThreadStore((s) => {
                if (!s) return s;
                return patchActive(s, (t) => ({
                  ...t,
                  messages: [...t.messages, { role: "assistant", content }],
                  updatedAt: Date.now(),
                }));
              });
              setStreamingDraft(null);
              setLiveToolRounds([]);
              speakAssistant(content);
              if (soulMemoryRef.current.autoLearnFromTurn) {
                const snippet = lastUserForSoulRef.current.trim().slice(0, 320);
                if (snippet) {
                  setSoulMemory((prev) => {
                    const notes = [...prev.learnedNotes.filter((n) => n !== snippet), snippet].slice(
                      -28
                    );
                    const next: SoulMemoryState = {
                      ...prev,
                      learnedNotes: notes,
                      updatedAt: new Date().toISOString(),
                    };
                    saveSoulMemoryToBrowser(next);
                    return next;
                  });
                }
              }
              onAfterAgentRun?.();
            } else if (ev.type === "error") {
              streamError = ev.message;
              setError(ev.message);
              setStreamingDraft(null);
              setLiveToolRounds([]);
              break readLoop;
            } else if (ev.type === "cancelled") {
              sawCancelled = true;
              setStreamingDraft(null);
              setLiveToolRounds([]);
              break readLoop;
            }
          }
        }

        if (
          isStallAbortRef.current &&
          !sawDone &&
          !streamError &&
          !sawCancelled
        ) {
          isStallAbortRef.current = false;
          clearStallWatchdog();
          const uiLine =
            "⚙️ Stream stagnierte — automatische Fortsetzung (kleinere Schritte, Workspace prüfen).";
          setThreadStore((s) => {
            if (!s) return s;
            return patchActive(s, (t) => {
              const nm = [...t.messages, { role: "user" as const, content: uiLine }];
              return { ...t, messages: nm, updatedAt: Date.now() };
            });
          });
          payload = [...payload, { role: "user", content: buildStallDiag(stallToolTraceRef.current) }];
          continue attempts;
        }

        if (!sawDone && !streamError && !sawCancelled && !fetchAborted) {
          const content = finalMessage || "Antwort unvollständig (Stream beendet).";
          setThreadStore((s) => {
            if (!s) return s;
            return patchActive(s, (t) => ({
              ...t,
              messages: [...t.messages, { role: "assistant", content }],
              updatedAt: Date.now(),
            }));
          });
          setStreamingDraft(null);
          setLiveToolRounds([]);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          if (isStallAbortRef.current && !sawDone && !streamError) {
            isStallAbortRef.current = false;
            clearStallWatchdog();
            const uiLine =
              "⚙️ Stream stagnierte — automatische Fortsetzung (kleinere Schritte, Workspace prüfen).";
            setThreadStore((s) => {
              if (!s) return s;
              return patchActive(s, (t) => {
                const nm = [...t.messages, { role: "user" as const, content: uiLine }];
                return { ...t, messages: nm, updatedAt: Date.now() };
              });
            });
            payload = [...payload, { role: "user", content: buildStallDiag(stallToolTraceRef.current) }];
            continue attempts;
          }
          fetchAborted = true;
          setStreamingDraft(null);
          setLiveToolRounds([]);
        } else {
          setError(e instanceof Error ? e.message : String(e));
          setStreamingDraft(null);
          setLiveToolRounds([]);
        }
      } finally {
        clearStallWatchdog();
      }

      break attempts;
    }

    abortRef.current = null;
    acRef.current = null;
    setLoading(false);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [
    input,
    loading,
    threadStore,
    onAfterAgentRun,
    onConsumeVerhoerPrefill,
    verhoerPrefill,
    clearStallWatchdog,
    contextAttachments,
    scratchPad,
    pendingImages,
    socraticDiff,
    speakAssistant,
    soulMemory,
  ]);

  const undoLastAgentRound = useCallback(async () => {
    if (!lastUndoSnapshots?.length || undoBusy) return;
    setUndoBusy(true);
    setError(null);
    try {
      const snaps = lastUndoSnapshots;
      const res = await fetch("/api/workspace/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshots: snaps }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setLastUndoSnapshots(null);
      onAfterUndo?.(snaps);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUndoBusy(false);
    }
  }, [lastUndoSnapshots, undoBusy, onAfterUndo]);

  const sortedThreads = threadStore
    ? [...threadStore.threads].sort((a, b) => b.updatedAt - a.updatedAt)
    : [];

  const chatDisabled =
    loading ||
    !input.trim() ||
    profiles.length === 0 ||
    !agentId ||
    !threadStore;

  return (
    <div className="flex h-full min-h-0 border-l border-[#3c3c3c] bg-[#252526]">
      <aside className="flex w-[132px] shrink-0 flex-col border-r border-[#3c3c3c] bg-[#252526]">
        <div className="shrink-0 border-b border-[#3c3c3c] px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-[#858585]">
          Chats
        </div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1">
          {!threadStore ? (
            <p className="px-1 py-2 text-[11px] text-[#858585]">Lädt…</p>
          ) : (
            sortedThreads.map((t) => {
              const active = t.id === threadStore.activeId;
              return (
                <button
                  key={t.id}
                  type="button"
                  title={t.title}
                  onClick={() => switchThread(t.id)}
                  className={`w-full truncate rounded px-2 py-1.5 text-left text-[11px] leading-tight ${
                    active
                      ? "bg-[#094771] text-white"
                      : "text-[#cccccc] hover:bg-[#2a2d2e]"
                  }`}
                >
                  {t.title}
                </button>
              );
            })
          )}
        </div>
        <div className="shrink-0 space-y-1 border-t border-[#3c3c3c] p-1.5">
          <button
            type="button"
            onClick={newThread}
            disabled={loading}
            className="w-full rounded bg-[#0e639c] py-1.5 text-[11px] font-medium text-white hover:bg-[#1177bb] disabled:opacity-40"
          >
            + Neuer Chat
          </button>
          <button
            type="button"
            onClick={exportActiveThread}
            disabled={!activeThread?.messages.length}
            className="w-full rounded border border-[#3c3c3c] py-1.5 text-[11px] text-[#cccccc] hover:bg-[#2a2d2e] disabled:opacity-35"
          >
            Export JSON
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#1e1e1e]">
        <header className="shrink-0 border-b border-[#3c3c3c] bg-[#252526] px-3 py-2">
          <div className="text-[12px] font-semibold text-[#cccccc]">Agent &amp; Chat</div>
          <div className="text-[10px] leading-snug text-[#858585]">
            Modell wählen, Kontext anhängen, Aufgabe senden — Antworten und Tool-Läufe erscheinen
            unten.
          </div>
        </header>

        <GeniusToolbox />

        <TradeAnalysisPanel agentId={agentId || FALLBACK_DEFAULT_AGENT_ID} />

        <CouncilPanel agentId={agentId || FALLBACK_DEFAULT_AGENT_ID} />

        <BugHunterArenaPanel agentId={agentId || FALLBACK_DEFAULT_AGENT_ID} />

        <SoulMemoryPanel value={soulMemory} onChange={setSoulMemory} getLastUserMessage={getLastUserMessage} />

        <div className="shrink-0 space-y-2 border-b border-[#3c3c3c] p-2">
          <div className="rounded-lg border border-[#454545] bg-[#252526] p-2 shadow-sm">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#9cdcfe]">
              Agenten-Profil
            </label>
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            disabled={loading || profiles.length === 0}
            className="w-full rounded border border-[#3c3c3c] bg-[#3c3c3c] px-2 py-1.5 text-[12px] text-[#cccccc] focus:border-[#007fd4] focus:outline-none disabled:opacity-50"
          >
            {profiles.length === 0 ? (
              <option value="">Agenten werden geladen…</option>
            ) : (
              profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} → {p.model || "(OPENAI_MODEL)"}
                </option>
              ))
            )}
          </select>
          <p className="text-[11px] leading-snug text-[#858585]">
            {activeProfile?.description ?? "—"}
          </p>
          <p className="font-mono text-[10px] text-[#569cd6]">
            Modell: {activeProfile?.model || "aus .env"}
            {typeof activeProfile?.maxToolRounds === "number" ? (
              <span className="text-[#858585]">
                {" "}
                · max. Tool-Runden: {activeProfile.maxToolRounds}
              </span>
            ) : null}
          </p>
          {localModels.length > 0 ? (
            <p className="text-[10px] text-[#6a9955]">
              Ollama erkannt: {localModels.length} installiert (z. B.{" "}
              {localModels.slice(0, 3).join(", ")}
              {localModels.length > 3 ? "…" : ""})
            </p>
          ) : localHint ? (
            <p className="text-[10px] text-[#dcdcaa]">{localHint}</p>
          ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#1e1e1e] px-2 py-2">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#858585]">
            Konversation
          </div>
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div key={`${threadStore?.activeId ?? "x"}-${i}`}>
                <div
                  className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${
                    msg.role === "user" ? "text-[#4ec9b0]" : "text-[#569cd6]"
                  }`}
                >
                  {msg.role === "user" ? "Du" : "Agent"}
                </div>
                <div
                  className={`rounded-lg px-3 py-2 ${
                    msg.role === "user"
                      ? "bg-[#2d2d30] text-[#d4d4d4]"
                      : "bg-[#252526] text-[#d4d4d4]"
                  }`}
                >
                  <ChatMarkdown text={msg.content} />
                </div>
              </div>
            ))}

            {loading && (streamingDraft !== null || liveToolRounds.length > 0) ? (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#569cd6]">
                  Agent
                </div>
                {streamingDraft !== null && streamingDraft !== "" ? (
                  <div className="rounded-lg border border-[#007fd4]/40 bg-[#252526] px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-[#d4d4d4]">
                    {streamingDraft}
                    <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-[#cccccc]" />
                  </div>
                ) : loading ? (
                  <div className="rounded-lg border border-[#3c3c3c] bg-[#252526] px-3 py-2 text-[13px] text-[#858585]">
                    Denkt / führt Werkzeuge aus…
                  </div>
                ) : null}
                {liveToolRounds.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {liveToolRounds.map((e, idx) => (
                      <TraceBlock key={idx} entry={e} />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {lastTrace?.some((t) => t.kind === "tool_round") ? (
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#c586c0]">
                  Letzte Tool-Spur
                </div>
                <div className="space-y-2">
                  {lastTrace
                    .filter(
                      (e): e is Extract<AgentTraceEntry, { kind: "tool_round" }> =>
                        e.kind === "tool_round"
                    )
                    .map((e, idx) => (
                      <TraceBlock key={idx} entry={e} />
                    ))}
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="rounded border border-[#f14c4c]/40 bg-[#3c1e1e] px-3 py-2 text-[13px] text-[#f48771]">
                {error}
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        </div>

        <div
          className={`shrink-0 border-t border-[#3c3c3c] bg-[#252526] p-2 transition-shadow ${
            dropHighlight ? "ring-2 ring-inset ring-[#007fd4]/70" : ""
          }`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={(e) => void handleDrop(e)}
        >
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#9cdcfe]">
            Nachricht, Kontext &amp; Optionen
          </div>
          <div className="mb-2 space-y-1.5 rounded-lg border border-[#454545] bg-[#1e1e1e] p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#858585]">
                Kontext (Datei / Ordner)
              </div>
              {dropBusy ? (
                <span className="shrink-0 text-[10px] text-[#569cd6]">Import…</span>
              ) : null}
            </div>
            <p className="text-[10px] leading-snug text-[#6a6a6a]">
              Explorer-Zeilen hierher ziehen, oder beliebige Dateien (Bilder, Video, Audio, Archive
              …) — landen unter{" "}
              <span className="font-mono text-[#858585]">.nemesis-drops/</span> und werden als
              Kontext mitgeschickt. Kleine Bilder zusätzlich als Vision an das Modell.
            </p>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                disabled={loading || dropBusy}
                onClick={() => filePickRef.current?.click()}
                className="rounded border border-[#454545] px-2 py-1 text-[11px] text-[#cccccc] hover:bg-[#2a2d2e] disabled:opacity-40"
              >
                Dateien wählen…
              </button>
              <input
                ref={filePickRef}
                type="file"
                multiple
                className="hidden"
                onChange={(ev) => {
                  const fl = ev.target.files;
                  if (fl?.length) void ingestExternalFiles(Array.from(fl));
                  ev.target.value = "";
                }}
              />
            </div>
            {contextAttachments.length > 0 ? (
              <ul className="flex flex-wrap gap-1">
                {contextAttachments.map((a) => (
                  <li
                    key={`${a.kind}:${a.path}`}
                    className="flex max-w-full items-center gap-1 rounded bg-[#3c3c3c] px-1.5 py-0.5 font-mono text-[10px] text-[#cccccc]"
                  >
                    <span className={a.kind === "dir" ? "text-[#dcdcaa]" : "text-[#4ec9b0]"}>
                      {a.kind === "dir" ? "📁" : "📄"}
                    </span>
                    <span className="truncate" title={a.path}>
                      {a.path}
                    </span>
                    <button
                      type="button"
                      aria-label="Entfernen"
                      className="shrink-0 text-[#858585] hover:text-[#f48771]"
                      onClick={() => removeContext(a.path, a.kind)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[10px] text-[#858585]">Optional — wird mit der nächsten Nachricht mitgesendet.</p>
            )}
            <div className="flex flex-wrap gap-1">
              {activeFilePath ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => addContext("file", activeFilePath)}
                  className="rounded border border-[#454545] px-2 py-1 text-[11px] text-[#cccccc] hover:bg-[#2a2d2e] disabled:opacity-40"
                >
                  Offene Datei
                </button>
              ) : null}
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                <select
                  value={pickFile}
                  onChange={(e) => setPickFile(e.target.value)}
                  disabled={loading || workspaceFiles.length === 0}
                  className="max-w-[140px] min-w-0 flex-1 rounded border border-[#3c3c3c] bg-[#1e1e1e] px-1 py-1 text-[11px] text-[#cccccc]"
                >
                  <option value="">Datei wählen…</option>
                  {workspaceFiles.slice(0, 400).map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={loading || !pickFile}
                  onClick={() => {
                    addContext("file", pickFile);
                    setPickFile("");
                  }}
                  className="rounded bg-[#0e639c] px-2 py-1 text-[11px] text-white hover:bg-[#1177bb] disabled:opacity-40"
                >
                  + Datei
                </button>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                <select
                  value={pickDir}
                  onChange={(e) => setPickDir(e.target.value)}
                  disabled={loading || workspaceDirs.length === 0}
                  className="max-w-[140px] min-w-0 flex-1 rounded border border-[#3c3c3c] bg-[#1e1e1e] px-1 py-1 text-[11px] text-[#cccccc]"
                >
                  <option value="">Ordner wählen…</option>
                  {workspaceDirs.slice(0, 200).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={loading || !pickDir}
                  onClick={() => {
                    addContext("dir", pickDir);
                    setPickDir("");
                  }}
                  className="rounded bg-[#0e639c] px-2 py-1 text-[11px] text-white hover:bg-[#1177bb] disabled:opacity-40"
                >
                  + Ordner
                </button>
              </div>
            </div>
          </div>

          <div className="mb-2 space-y-1.5 rounded-lg border border-[#454545] bg-[#1e1e1e] p-2">
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#858585]">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={socraticDiff}
                  onChange={(e) => setSocraticDiff(e.target.checked)}
                  className="accent-[#007fd4]"
                />
                Diff / Erklärung als Verhör (Socratic)
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={headphoneMode}
                  onChange={(e) => setHeadphoneMode(e.target.checked)}
                  className="accent-[#007fd4]"
                />
                Kopfhörermodus (Antwort vorlesen)
              </label>
              <button
                type="button"
                disabled={loading || sttActive}
                onClick={() => startStt()}
                className="rounded border border-[#454545] px-2 py-0.5 text-[10px] text-[#cccccc] hover:bg-[#2a2d2e] disabled:opacity-40"
              >
                {sttActive ? "Höre…" : "Sprache → Text"}
              </button>
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-[#858585]">
              Scratch-Pad (wird mitgeschickt)
            </div>
            <textarea
              value={scratchPad}
              onChange={(e) => setScratchPad(e.target.value)}
              rows={2}
              placeholder="Notizen, Snippets, Kontext…"
              className="w-full resize-y rounded border border-[#3c3c3c] bg-[#1e1e1e] px-2 py-1 text-[11px] text-[#cccccc] placeholder:text-[#6a6a6a]"
            />
          </div>

          {pendingImages.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1">
              {pendingImages.map((img, idx) => (
                <span
                  key={`${idx}-${img.base64.slice(0, 8)}`}
                  className="flex items-center gap-1 rounded bg-[#3c3c3c] px-2 py-0.5 font-mono text-[10px] text-[#ce9178]"
                >
                  Vision {idx + 1}
                  <button
                    type="button"
                    className="text-[#858585] hover:text-[#f48771]"
                    aria-label="Bild entfernen"
                    onClick={() =>
                      setPendingImages((p) => p.filter((_, i) => i !== idx))
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => {
              const items = e.clipboardData?.items;
              if (!items?.length) return;
              const pastedFiles: File[] = [];
              for (let i = 0; i < items.length; i++) {
                const it = items[i];
                if (it?.kind === "file") {
                  const f = it.getAsFile();
                  if (f) pastedFiles.push(f);
                }
              }
              if (pastedFiles.length > 0) {
                e.preventDefault();
                void ingestExternalFiles(pastedFiles);
                return;
              }
              let foundImage = false;
              for (let i = 0; i < items.length; i++) {
                const it = items[i];
                if (!it?.type.startsWith("image/")) continue;
                const f = it.getAsFile();
                if (!f) continue;
                foundImage = true;
                const reader = new FileReader();
                reader.onload = () => {
                  const r = String(reader.result ?? "");
                  const m = /^data:([^;]+);base64,(.+)$/.exec(r);
                  if (m) {
                    setPendingImages((p) => {
                      if (p.length >= 6) return p;
                      return [...p, { mime: m[1], base64: m[2] }];
                    });
                  }
                };
                reader.readAsDataURL(f);
              }
              if (foundImage) e.preventDefault();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Aufgabe… (Enter senden). Dateien hierher ziehen: Bild/Video/Audio → Workspace + Kontext."
            rows={3}
            className="mb-2 w-full resize-none rounded border border-[#3c3c3c] bg-[#3c3c3c] px-2 py-1.5 text-[13px] text-[#cccccc] placeholder:text-[#6a6a6a] focus:border-[#007fd4] focus:outline-none"
            disabled={loading || !threadStore}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={(e) => void handleDrop(e)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void send()}
              disabled={chatDisabled}
              className="min-w-0 flex-1 rounded bg-[#0e639c] py-2 text-[13px] font-medium text-white hover:bg-[#1177bb] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Agent arbeitet…" : "Ausführen"}
            </button>
            <button
              type="button"
              onClick={() => void undoLastAgentRound()}
              disabled={!lastUndoSnapshots?.length || undoBusy || loading}
              title="Letzte Agent-Dateiänderungen im Workspace zurücksetzen"
              className="shrink-0 rounded border border-[#dcdcaa]/40 px-3 py-2 text-[13px] text-[#dcdcaa] hover:bg-[#2a2d2e] disabled:cursor-not-allowed disabled:opacity-35"
            >
              {undoBusy ? "…" : "Rückgängig"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={!loading}
              className="shrink-0 rounded border border-[#6a6a6a] px-3 py-2 text-[13px] text-[#cccccc] hover:bg-[#2a2d2e] disabled:cursor-not-allowed disabled:opacity-35"
            >
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
