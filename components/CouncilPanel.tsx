"use client";

import { useCallback, useState } from "react";
import { ChatMarkdown } from "@/components/ChatMarkdown";

type CouncilEv =
  | { type: "assistant_delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export function CouncilPanel({ agentId }: { agentId: string }) {
  const [open, setOpen] = useState(false);
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  const runCouncil = useCallback(async () => {
    const text = idea.trim();
    if (!text || loading) return;
    setLoading(true);
    setError(null);
    setReport("");
    try {
      const res = await fetch("/api/council", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: text, stream: true, agentId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        setError("Kein Stream.");
        return;
      }
      const dec = new TextDecoder();
      let buf = "";
      let out = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: CouncilEv;
          try {
            ev = JSON.parse(line) as CouncilEv;
          } catch {
            continue;
          }
          if (ev.type === "assistant_delta") {
            out += ev.text;
            setReport(out);
          } else if (ev.type === "error") {
            setError(ev.message);
            return;
          }
        }
      }
      setReport(out || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [idea, loading, agentId]);

  return (
    <div className="border-b border-[#3c3c3c] bg-[#1a1a24] px-2 py-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-[#2a2d3e]"
      >
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-[#dcdcaa]">Nemesis-Rat</div>
          <div className="truncate text-[10px] text-[#858585]">
            7 Rollen · ein gemeinsames Urteil — wie ein kleines KI-Unternehmen
          </div>
        </div>
        <span className="shrink-0 rounded border border-[#569cd6]/40 px-1.5 py-0.5 text-[10px] text-[#9cdcfe]">
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-lg border border-[#569cd6]/25 bg-[#252526] p-2">
          <p className="text-[10px] leading-snug text-[#858585]">
            Builder, Designer, Hacker, Investor, Psychologe, Legal Guard und Launch Coach
            bewerten deine Idee in einem Durchlauf. Es ersetzt keine Anwälte, Therapeuten oder
            Finanzberater.
          </p>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={4}
            placeholder="Beschreibe deine Idee oder dein Vorhaben…"
            disabled={loading}
            className="w-full resize-y rounded border border-[#3c3c3c] bg-[#1e1e1e] px-2 py-1.5 text-[12px] text-[#cccccc] placeholder:text-[#6a6a6a] disabled:opacity-50"
          />
          <p className="text-[10px] text-[#6a6a6a]">
            Modell = aktuell gewähltes <strong className="text-[#858585]">Agenten-Profil</strong> oben
            — für längere Ratssitzungen eignet sich z. B. <strong className="text-[#858585]">Blueprint</strong>{" "}
            (Premium).
          </p>
          <button
            type="button"
            disabled={loading || !idea.trim()}
            onClick={() => void runCouncil()}
            className="rounded bg-[#68217a] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#7c3a8d] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Rat tagt…" : "Rat einholen"}
          </button>
          {error ? (
            <div className="rounded border border-[#f14c4c]/40 bg-[#3c1e1e] px-2 py-1.5 text-[12px] text-[#f48771]">
              {error}
            </div>
          ) : null}
          {report ? (
            <div className="max-h-[min(55vh,520px)] overflow-y-auto rounded border border-[#3c3c3c] bg-[#1e1e1e] px-2 py-2">
              <ChatMarkdown text={report} />
            </div>
          ) : loading ? (
            <p className="text-[11px] text-[#858585]">Antwort wird gestreamt…</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
