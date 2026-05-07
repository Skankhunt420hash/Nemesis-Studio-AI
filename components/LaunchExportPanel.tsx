"use client";

import { useCallback, useState } from "react";
import type { AgentProfile } from "@/lib/agent-profile-types";
import type { ChatThreadsStore } from "@/lib/chat-threads-storage";
import { SOUL_MEMORY_STORAGE_KEY } from "@/lib/soul-memory-types";

type ExportPayload = {
  exportedAt: string;
  selectedAgentId: string;
  selectedAgentLabel?: string;
  autoSave: {
    chats: boolean;
    soulMemory: boolean;
    scratchPad: boolean;
  };
  chatThreads: ChatThreadsStore | null;
  soulMemory: unknown;
  scratchPad: string;
  profiles: AgentProfile[];
};

function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function LaunchExportPanel({
  selectedAgentId,
  profiles,
}: {
  selectedAgentId: string;
  profiles: AgentProfile[];
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportAll = useCallback(() => {
    setError(null);
    try {
      const rawThreads = localStorage.getItem("nemesis_chat_threads_v1");
      const chatThreads = rawThreads ? (JSON.parse(rawThreads) as ChatThreadsStore) : null;
      const rawSoul = localStorage.getItem(SOUL_MEMORY_STORAGE_KEY);
      const soulMemory = rawSoul ? (JSON.parse(rawSoul) as unknown) : null;
      const scratchPad = localStorage.getItem("nemesis_scratch_pad") ?? "";
      const selected = profiles.find((p) => p.id === selectedAgentId);
      const payload: ExportPayload = {
        exportedAt: new Date().toISOString(),
        selectedAgentId,
        selectedAgentLabel: selected?.label,
        autoSave: {
          chats: true,
          soulMemory: true,
          scratchPad: true,
        },
        chatThreads,
        soulMemory,
        scratchPad,
        profiles,
      };
      downloadJson(`nemesis-export-all-${Date.now()}.json`, payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [profiles, selectedAgentId]);

  const exportWorkspace = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workspace/export");
      const data = (await res.json()) as unknown;
      if (!res.ok) {
        throw new Error(
          typeof data === "object" && data && "error" in data
            ? String((data as { error?: string }).error)
            : `HTTP ${res.status}`
        );
      }
      downloadJson(`nemesis-workspace-export-${Date.now()}.json`, data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="border-b border-[#3c3c3c] bg-[#201a2b] px-2 py-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-[#2f2540]"
      >
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-[#c586c0]">Launch & Export</div>
          <div className="truncate text-[10px] text-[#8b8b8b]">
            Go-Live-Check + Inhalte in JSON exportieren
          </div>
        </div>
        <span className="shrink-0 rounded border border-[#c586c0]/40 px-1.5 py-0.5 text-[10px] text-[#d7bde2]">
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-lg border border-[#c586c0]/25 bg-[#252526] p-2">
          <ul className="space-y-1 text-[10px] text-[#9a9a9a]">
            <li>- Auto-Save: Chats, Soul Memory, Scratch-Pad laufen bereits lokal.</li>
            <li>- Für APK: `CAP_SERVER_URL` setzen und `npx cap sync android`.</li>
            <li>- Für Launch: Domain + HTTPS + funktionierende `/api/*` prüfen.</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportAll}
              className="rounded bg-[#7c3aed] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#8b5cf6]"
            >
              Alles exportieren
            </button>
            <button
              type="button"
              onClick={() => void exportWorkspace()}
              disabled={busy}
              className="rounded bg-[#a16207] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#ca8a04] disabled:opacity-40"
            >
              {busy ? "Export läuft…" : "Workspace exportieren"}
            </button>
          </div>
          {error ? (
            <div className="rounded border border-[#f14c4c]/40 bg-[#3c1e1e] px-2 py-1.5 text-[12px] text-[#f48771]">
              {error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
