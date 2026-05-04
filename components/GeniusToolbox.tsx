"use client";

import { useCallback, useMemo, useState } from "react";
import { ALLOWED_COINGECKO_IDS, computeRiskSizingJson } from "@/lib/genius-crypto";

const DEFAULT_IDS = ["bitcoin", "ethereum", "solana"] as const;

/** Optionale Studio-Hilfen (öffentliche Daten) — Kern bleibt der KI-Agent. */
export function GeniusToolbox() {
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState<string[]>([...DEFAULT_IDS]);
  const [pricesJson, setPricesJson] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [eq, setEq] = useState("10000");
  const [risk, setRisk] = useState("1");
  const [stop, setStop] = useState("2");

  const sizingPreview = useMemo(() => {
    const e = Number(eq);
    const r = Number(risk);
    const s = Number(stop);
    return computeRiskSizingJson(e, r, s);
  }, [eq, risk, stop]);

  const refreshPrices = useCallback(async () => {
    setLoading(true);
    try {
      const q = ids.length ? ids.join(",") : "bitcoin";
      const res = await fetch(`/api/genius/crypto-prices?ids=${encodeURIComponent(q)}`);
      const text = await res.text();
      setPricesJson(text);
    } catch (e) {
      setPricesJson(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setLoading(false);
    }
  }, [ids]);

  const toggleId = (id: string) => {
    setIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 8) return prev;
      return [...prev, id];
    });
  };

  return (
    <div className="border-b border-[#3c3c3c] bg-[#252526] px-2 py-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-[#2a2d2e]"
      >
        <span className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
          <span className="text-[11px] font-semibold text-[#cccccc]">Studio-Extras</span>
          <span className="truncate text-[10px] text-[#858585]">
            Referenzkurse &amp; Rechenhilfen (optional, für Demos / Widgets)
          </span>
        </span>
        <span className="shrink-0 rounded border border-[#454545] px-1.5 py-0.5 text-[10px] text-[#9cdcfe]">
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-lg border border-[#454545] bg-[#1e1e1e] p-2 pb-2">
          <p className="text-[10px] leading-snug text-[#858585]">
            Öffentliche API-Daten — kein Handel über Nemesis Studio. Für ansprechende Agent-Demos
            oder Dashboard-Texte nutzbar.
          </p>
          <div className="flex flex-wrap gap-1">
            {ALLOWED_COINGECKO_IDS.slice(0, 12).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => toggleId(id)}
                className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                  ids.includes(id)
                    ? "bg-[#007acc]/25 text-[#9cdcfe] ring-1 ring-[#007acc]/40"
                    : "bg-[#2d2d30] text-[#858585] hover:text-[#cccccc]"
                }`}
              >
                {id.slice(0, 4)}
              </button>
            ))}
            <span className="text-[9px] text-[#6a6a6a]">… weitere IDs per Tool</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void refreshPrices()}
              className="rounded bg-[#0e639c] px-2 py-1 text-[10px] font-medium text-white hover:bg-[#1177bb] disabled:opacity-40"
            >
              {loading ? "Lädt…" : "Kurse laden"}
            </button>
          </div>
          {pricesJson ? (
            <pre className="max-h-28 overflow-auto rounded border border-[#3c3c3c] bg-[#252526] p-1.5 font-mono text-[9px] text-[#b5cea8]">
              {pricesJson.slice(0, 3500)}
            </pre>
          ) : (
            <p className="text-[10px] text-[#6a6a6a]">Hier erscheint die JSON-Antwort zum Einklinken in UI-Entwürfe.</p>
          )}
          <div className="rounded border border-[#3c3c3c] bg-[#252526] p-2">
            <div className="mb-1 text-[10px] font-medium text-[#4ec9b0]">Positionsgröße (Rechenbeispiel)</div>
            <div className="mb-1 flex flex-wrap gap-1 text-[10px]">
              <label className="flex items-center gap-0.5 text-[#858585]">
                Equity $
                <input
                  value={eq}
                  onChange={(e) => setEq(e.target.value)}
                  className="w-16 rounded border border-[#3c3c3c] bg-[#1e1e1e] px-1 font-mono text-[#cccccc]"
                />
              </label>
              <label className="flex items-center gap-0.5 text-[#858585]">
                Risk %
                <input
                  value={risk}
                  onChange={(e) => setRisk(e.target.value)}
                  className="w-10 rounded border border-[#3c3c3c] bg-[#1e1e1e] px-1 font-mono text-[#cccccc]"
                />
              </label>
              <label className="flex items-center gap-0.5 text-[#858585]">
                Stop %
                <input
                  value={stop}
                  onChange={(e) => setStop(e.target.value)}
                  className="w-10 rounded border border-[#3c3c3c] bg-[#1e1e1e] px-1 font-mono text-[#cccccc]"
                />
              </label>
            </div>
            <pre className="max-h-24 overflow-auto font-mono text-[9px] text-[#ce9178]">{sizingPreview}</pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
