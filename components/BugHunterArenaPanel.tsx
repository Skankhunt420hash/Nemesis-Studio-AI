"use client";

import { useCallback, useMemo, useState } from "react";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import { ARENA_HUNTERS } from "@/lib/bug-hunter-arena-prompts";

type ArenaEv =
  | { type: "phase"; phase: "hunters" | "synthesis" }
  | {
      type: "hunter_done";
      key: string;
      title: string;
      content: string;
      error?: string;
    }
  | { type: "assistant_delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

type HunterCard = {
  key: string;
  title: string;
  content: string;
  error?: string;
  done: boolean;
};

export function BugHunterArenaPanel({ agentId }: { agentId: string }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "hunters" | "synthesis">("idle");
  const [cards, setCards] = useState<HunterCard[]>(() =>
    ARENA_HUNTERS.map((h) => ({
      key: h.key,
      title: h.title,
      content: "",
      done: false,
    }))
  );
  const [report, setReport] = useState<string | null>(null);

  const resetCards = useCallback(() => {
    setCards(
      ARENA_HUNTERS.map((h) => ({
        key: h.key,
        title: h.title,
        content: "",
        done: false,
      }))
    );
  }, []);

  const runArena = useCallback(async () => {
    const text = target.trim();
    if (!text || loading) return;
    setLoading(true);
    setError(null);
    setReport("");
    setPhase("hunters");
    resetCards();
    try {
      const res = await fetch("/api/bug-hunter-arena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: text, stream: true, agentId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `HTTP ${res.status}`);
        setPhase("idle");
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        setError("Kein Stream.");
        setPhase("idle");
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
          let ev: ArenaEv;
          try {
            ev = JSON.parse(line) as ArenaEv;
          } catch {
            continue;
          }
          if (ev.type === "phase") {
            setPhase(ev.phase === "hunters" ? "hunters" : "synthesis");
          } else if (ev.type === "hunter_done") {
            setCards((prev) =>
              prev.map((c) =>
                c.key === ev.key
                  ? {
                      ...c,
                      content: ev.content,
                      error: ev.error,
                      done: true,
                    }
                  : c
              )
            );
          } else if (ev.type === "assistant_delta") {
            out += ev.text;
            setReport(out);
          } else if (ev.type === "error") {
            setError(ev.message);
            setPhase("idle");
            return;
          }
        }
      }
      setReport(out || null);
      setPhase("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    } finally {
      setLoading(false);
    }
  }, [target, loading, agentId, resetCards]);

  const doneCount = useMemo(() => cards.filter((c) => c.done).length, [cards]);

  return (
    <div className="border-b border-[#3c3c3c] bg-[#1a1a24] px-2 py-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-[#2a2d3e]"
      >
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-[#ce9178]">Bug Hunter Arena</div>
          <div className="truncate text-[10px] text-[#858585]">
            4 Mini-Agenten parallel · gemeinsamer Kampfbericht
          </div>
        </div>
        <span className="shrink-0 rounded border border-[#ce9178]/40 px-1.5 py-0.5 text-[10px] text-[#dcdcaa]">
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-lg border border-[#ce9178]/25 bg-[#252526] p-2">
          <p className="text-[10px] leading-snug text-[#858585]">
            Security, Logik, UI/UX und Chaos/Breaker prüfen denselben Kontext parallel. Anschließend
            entsteht ein zusammengeführter Kampfbericht. Ersetzt keine Pentests oder manuelle QA.
          </p>
          <textarea
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            rows={5}
            placeholder="Code-Schnipsel, Feature-Beschreibung, API-Verhalten, reproduzierbare Steps …"
            disabled={loading}
            className="w-full resize-y rounded border border-[#3c3c3c] bg-[#1e1e1e] px-2 py-1.5 text-[12px] text-[#cccccc] placeholder:text-[#6a6a6a] disabled:opacity-50"
          />
          <p className="text-[10px] text-[#6a6a6a]">
            Modell = gewähltes <strong className="text-[#858585]">Agenten-Profil</strong> — empfohlen:{" "}
            <strong className="text-[#858585]">Surgeon</strong> oder <strong className="text-[#858585]">Blueprint</strong>{" "}
            (Premium).
          </p>
          <button
            type="button"
            disabled={loading || !target.trim()}
            onClick={() => void runArena()}
            className="rounded bg-[#a0522d] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#b8622d] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Arena läuft…" : "Arena starten"}
          </button>

          {loading || doneCount > 0 ? (
            <div className="space-y-1.5">
              <div className="text-[10px] font-medium text-[#858585]">
                Jäger{" "}
                {phase === "hunters"
                  ? `(${doneCount}/${ARENA_HUNTERS.length} fertig)`
                  : phase === "synthesis"
                    ? "— Kampfbericht"
                    : ""}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {cards.map((c) => (
                  <div
                    key={c.key}
                    className={`rounded border px-1.5 py-1 text-[10px] leading-snug ${
                      c.error
                        ? "border-[#f14c4c]/50 bg-[#2a1a1a] text-[#f48771]"
                        : c.done
                          ? "border-[#6a9955]/40 bg-[#1e2a1e] text-[#b5cea8]"
                          : "border-[#3c3c3c] bg-[#1e1e1e] text-[#858585]"
                    }`}
                  >
                    <div className="font-semibold text-[#dcdcaa]">{c.title}</div>
                    {c.error ? (
                      <div className="mt-0.5 break-words">{c.error}</div>
                    ) : c.done ? (
                      <div className="mt-0.5 text-[#858585]">Fertig</div>
                    ) : loading ? (
                      <div className="mt-0.5 animate-pulse">…</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded border border-[#f14c4c]/40 bg-[#3c1e1e] px-2 py-1.5 text-[12px] text-[#f48771]">
              {error}
            </div>
          ) : null}
          {cards.some((c) => c.done && (c.content || c.error)) ? (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold text-[#858585]">Rohergebnisse der Jäger</div>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-[#3c3c3c] bg-[#1e1e1e] p-1.5">
                {cards.map((c) =>
                  c.done && (c.content || c.error) ? (
                    <details key={c.key} className="rounded border border-[#454545] bg-[#252526] px-2 py-1">
                      <summary className="cursor-pointer text-[10px] font-medium text-[#dcdcaa]">
                        {c.title}
                      </summary>
                      <div className="mt-1 max-h-36 overflow-y-auto border-t border-[#3c3c3c] pt-1 text-[10px]">
                        {c.error ? (
                          <span className="text-[#f48771]">{c.error}</span>
                        ) : (
                          <ChatMarkdown text={c.content} />
                        )}
                      </div>
                    </details>
                  ) : null
                )}
              </div>
            </div>
          ) : null}

          {report ? (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#ce9178]">
                Kampfbericht
              </div>
              <div className="max-h-[min(55vh,520px)] overflow-y-auto rounded border border-[#3c3c3c] bg-[#1e1e1e] px-2 py-2">
                <ChatMarkdown text={report} />
              </div>
            </div>
          ) : loading && phase === "synthesis" && !report ? (
            <p className="text-[11px] text-[#858585]">Kampfbericht wird erstellt…</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
