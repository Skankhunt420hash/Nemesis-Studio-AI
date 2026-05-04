/**
 * „Genius“-Hilfen für Krypto-Bot-Entwicklung: nur öffentliche Infos + Mathematik.
 * Keine Order-Ausführung, keine Wallet-Anbindung, keine Anlageberatung.
 */

const COINGECKO_SIMPLE = "https://api.coingecko.com/api/v3/simple/price";

/** Erlaubte CoinGecko-IDs (Allowlist gegen Missbrauch / SSRF-artige Pfade). */
export const ALLOWED_COINGECKO_IDS = [
  "bitcoin",
  "ethereum",
  "solana",
  "cardano",
  "ripple",
  "dogecoin",
  "polkadot",
  "avalanche-2",
  "chainlink",
  "matic-network",
  "litecoin",
  "tron",
  "uniswap",
  "cosmos",
  "stellar",
  "monero",
  "bitcoin-cash",
  "ethereum-classic",
  "filecoin",
  "the-graph",
] as const;

const ALLOWED_SET = new Set<string>(ALLOWED_COINGECKO_IDS);

let priceCache: { key: string; at: number; json: string } | null = null;
const PRICE_CACHE_MS = 45_000;

export function sanitizeCoingeckoIds(raw: unknown, max = 12): string[] {
  const list: string[] = [];
  if (Array.isArray(raw)) {
    for (const x of raw) {
      if (typeof x !== "string") continue;
      const id = x.trim().toLowerCase();
      if (ALLOWED_SET.has(id) && !list.includes(id)) list.push(id);
      if (list.length >= max) break;
    }
    return list;
  }
  if (typeof raw === "string") {
    for (const part of raw.split(/[\s,]+/)) {
      const id = part.trim().toLowerCase();
      if (!id || !ALLOWED_SET.has(id) || list.includes(id)) continue;
      list.push(id);
      if (list.length >= max) break;
    }
  }
  return list;
}

export function sanitizeVsCurrencies(raw: unknown, max = 5): string[] {
  const def = ["usd", "eur"];
  if (raw === undefined || raw === null) return def;
  const out: string[] = [];
  const push = (v: string) => {
    const s = v.trim().toLowerCase();
    if (!/^[a-z]{2,10}$/.test(s) || out.includes(s)) return;
    out.push(s);
  };
  if (Array.isArray(raw)) {
    for (const x of raw) {
      if (typeof x === "string") push(x);
      if (out.length >= max) break;
    }
  } else if (typeof raw === "string") {
    for (const part of raw.split(/[\s,]+/)) push(part);
  }
  return out.length ? out.slice(0, max) : def;
}

export async function fetchCoingeckoSimplePrices(
  ids: string[],
  vsCurrencies: string[]
): Promise<string> {
  if (!ids.length) {
    return JSON.stringify({
      error:
        "Keine gültigen coin_ids. Erlaubt u. a.: " + ALLOWED_COINGECKO_IDS.slice(0, 8).join(", ") + " …",
    });
  }
  const vs = vsCurrencies.length ? vsCurrencies : ["usd", "eur"];
  const key = `${ids.sort().join(",")}|${vs.join(",")}`;
  const now = Date.now();
  if (priceCache && priceCache.key === key && now - priceCache.at < PRICE_CACHE_MS) {
    return priceCache.json;
  }

  const url = `${COINGECKO_SIMPLE}?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=${encodeURIComponent(vs.join(","))}&include_24hr_change=true`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": "NemesisStudio/1.0" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return JSON.stringify({
        error: `CoinGecko HTTP ${res.status}`,
        detail: text.slice(0, 400),
      });
    }
    const data = (await res.json()) as Record<string, Record<string, number>>;
    const out = JSON.stringify(
      {
        source: "coingecko_public",
        disclaimer:
          "Nur Marktinformationen, keine Anlageempfehlung. Keine Order-Ausführung durch dieses Tool.",
        fetched_at: new Date().toISOString(),
        prices: data,
      },
      null,
      2
    );
    priceCache = { key, at: now, json: out };
    return out;
  } catch (e) {
    return JSON.stringify({
      error: e instanceof Error ? e.message : String(e),
    });
  } finally {
    clearTimeout(timer);
  }
}

export function computeRiskSizingJson(
  equityUsd: number,
  riskPercent: number,
  stopMovePercent: number
): string {
  if (!Number.isFinite(equityUsd) || equityUsd <= 0) {
    return JSON.stringify({ error: "equity_usd muss eine positive Zahl sein." });
  }
  if (!Number.isFinite(riskPercent) || riskPercent <= 0 || riskPercent > 25) {
    return JSON.stringify({
      error: "risk_percent muss > 0 und ≤ 25 sein (Risiko pro Trade am Kapital).",
    });
  }
  if (!Number.isFinite(stopMovePercent) || stopMovePercent <= 0 || stopMovePercent > 80) {
    return JSON.stringify({
      error: "stop_move_percent muss > 0 und ≤ 80 sein (Abstand Stop in % vom Einstieg, grob).",
    });
  }
  const riskUsd = equityUsd * (riskPercent / 100);
  const maxNotional = riskUsd / (stopMovePercent / 100);
  return JSON.stringify(
    {
      disclaimer:
        "Nur Rechenhilfe (kein Live-Handel, keine Slippage/Fees). Für Bildungs- und Bot-UI-Zwecke.",
      equity_usd: equityUsd,
      risk_percent: riskPercent,
      stop_move_percent: stopMovePercent,
      risk_usd_per_trade: Math.round(riskUsd * 100) / 100,
      suggested_max_notional_usd: Math.round(maxNotional * 100) / 100,
      formula:
        "notional ≈ (Equity × risk%) / (stop_move%) — Verlust bis Stop ≈ risk% des Kapitals, wenn der Stop genau bei stop_move% liegt.",
    },
    null,
    2
  );
}
