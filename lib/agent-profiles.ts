/**
 * Agenten: primär aus **config/agents.json** (oder NEMESIS_AGENTS_JSON), sonst eingebaute Liste.
 */

import fs from "fs/promises";
import path from "path";
import type { AgentProfile } from "./agent-profile-types";
import { FALLBACK_DEFAULT_AGENT_ID } from "./agent-profile-types";

export type { AgentProfile };
export { FALLBACK_DEFAULT_AGENT_ID } from "./agent-profile-types";

const BASE_AGENT_HINT = `Alle Anfragen laufen über den konfigurierten Endpoint (typisch Ollama: OPENAI_BASE_URL=http://127.0.0.1:11434/v1).`;

const BUILTIN: AgentProfile[] = [
  {
    id: "coder",
    label: "Programmierer",
    description: "Implementierung, Refactoring, Tools im Workspace",
    model: "qwen2.5-coder:7b",
    systemExtension: `Du bist auf **Code und Dateiänderungen** spezialisiert.
Schreibe kurze, korrekte Änderungen; nutze str_replace wenn möglich; erkläre nur das Nötige.`,
  },
  {
    id: "architect",
    label: "Architekt",
    description: "Struktur, Module, grobe Pläne — weniger Code",
    model: "llama3.2",
    systemExtension: `Du bist auf **Software-Architektur und Entwurf** spezialisiert: Module, Datenfluss, Schnittstellen, Trade-offs.
Schlage konkrete Ordner-/Dateistrukturen vor; vollständigen Code nur auf explizite Bitte.`,
  },
  {
    id: "docs",
    label: "Dokumentation",
    description: "README, Kommentare, Erklärungen",
    model: "llama3.2",
    systemExtension: `Du bist auf **Dokumentation** spezialisiert: README, Kommentare, klare Anleitungen, Markdown.
Nutze read_file für bestehende Texte; sachlich und auf Deutsch, wenn der Nutzer Deutsch nutzt.`,
  },
  {
    id: "debug",
    label: "Debug & Analyse",
    description: "Fehler eingrenzen, Logs, grep",
    model: "llama3.2",
    systemExtension: `Du bist auf **Fehlersuche** spezialisiert: Hypothesen, gezieltes Lesen, grep, kleine Repro-Schritte.
Keine großen Refactors ohne Aufforderung; erst Ursache, dann minimaler Fix.`,
  },
  {
    id: "data",
    label: "Daten & Config",
    description: "JSON, YAML, CSV, Konfiguration",
    model: "llama3.2",
    systemExtension: `Du bist auf **strukturierte Daten und Konfiguration** spezialisiert: JSON, YAML, .env-Beispiele, Schemas.
Achte auf Syntax; vor Überschreiben mit read_file prüfen.`,
  },
  {
    id: "council",
    label: "Nemesis-Rat",
    description: "Empfohlenes Modell für das 7-Personen-Gremium (nur Modellwahl; Text kommt von /api/council)",
    model: "llama3.2",
    systemExtension: `Dieses Profil ist für die **Modellwahl** beim Nemesis-Rat gedacht (längere, strukturierte Antworten). Der eigentliche Rat-Prompt ist fest im Server.`,
  },
  {
    id: "crypto",
    label: "Referenzdaten & Formeln",
    description: "Öffentliche Kurs-Snippets, Formatierung — optional zu Nemesis Studio",
    model: "qwen2.5-coder:7b",
    maxToolRounds: 36,
    systemExtension: `Du ergänzt **Nemesis Studio** mit optionalen Markt-Daten-Widgets und Texten (kein Schwerpunkt Krypto-Bot).

Tools:
- **crypto_public_prices** — Referenzkurse (read-only, Allowlist).
- **crypto_risk_sizing** — Positionsgröße grob überschlagen (Bildung).
- **genius_format_currency** — schöne Beträge für UI.

Keine Anlageberatung, keine Garantien.`,
  },
  {
    id: "rocket",
    label: "Fast Rocket",
    description: "End-to-end: von A bis Z liefern, viele Tool-Runden",
    model: "qwen2.5-coder:7b",
    maxToolRounds: 48,
    systemExtension: `Du bist der **Fast-Rocket-Agent**: Du bekommst eine Aufgabe und lieferst **von A bis Z** ein funktionierendes Ergebnis im Workspace.

Vorgehen:
1. Kurz planen (intern), dann **sofort** mit Tools arbeiten — nicht endlos fragen.
2. Ordnerstruktur, Dateien, Konfiguration, README: **alles erstellen**, was für die Aufgabe nötig ist.
3. Lieber **iterieren** (read → write/str_replace) als stecken bleiben; bei Fehlern Strategie wechseln.
4. Am Ende: kurze Zusammenfassung, was erstellt/geändert wurde und wie man es testet.

Nutze viele Tool-Runden sinnvoll; halte Antworttexte kompakt, Code über Dateien.`,
  },
].map((p) => ({
  ...p,
  systemExtension: `${p.systemExtension}\n\n${BASE_AGENT_HINT}`,
}));

function withHint(p: AgentProfile): AgentProfile {
  const ext = p.systemExtension.trimEnd();
  if (ext.includes("OPENAI_BASE_URL=http://127.0.0.1:11434")) return p;
  return {
    ...p,
    systemExtension: `${ext}\n\n${BASE_AGENT_HINT}`,
  };
}

function normalizeAgentsArray(arr: unknown[]): AgentProfile[] {
  const out: AgentProfile[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    if (!id) continue;
    const label = typeof o.label === "string" && o.label.trim() ? o.label.trim() : id;
    const description =
      typeof o.description === "string" ? o.description : "";
    const systemExtension =
      typeof o.systemExtension === "string" ? o.systemExtension : "";
    const model = typeof o.model === "string" ? o.model : "";
    const maxToolRounds =
      typeof o.maxToolRounds === "number" && Number.isFinite(o.maxToolRounds)
        ? Math.min(80, Math.max(4, Math.floor(o.maxToolRounds)))
        : undefined;
    out.push(
      withHint({ id, label, description, systemExtension, model, maxToolRounds })
    );
  }
  return out;
}

function parseAgentsJson(data: unknown): {
  defaultAgentId: string | undefined;
  profiles: AgentProfile[];
} {
  if (Array.isArray(data)) {
    return { defaultAgentId: undefined, profiles: normalizeAgentsArray(data) };
  }
  if (!data || typeof data !== "object") {
    return { defaultAgentId: undefined, profiles: [] };
  }
  const root = data as Record<string, unknown>;
  const defaultAgentId =
    typeof root.defaultAgentId === "string" ? root.defaultAgentId.trim() : undefined;
  const agents = Array.isArray(root.agents) ? root.agents : [];
  return { defaultAgentId, profiles: normalizeAgentsArray(agents) };
}

function defaultConfigPath(): string {
  return path.join(process.cwd(), "config", "agents.json");
}

async function readAgentsFromDisk(): Promise<{
  defaultAgentId: string | undefined;
  profiles: AgentProfile[];
  pathUsed: string | null;
}> {
  const custom = process.env.NEMESIS_AGENTS_JSON?.trim();
  const candidates = [custom, defaultConfigPath()].filter(Boolean) as string[];

  for (const filePath of candidates) {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      const { defaultAgentId, profiles } = parseAgentsJson(parsed);
      if (profiles.length > 0) {
        return { defaultAgentId, profiles, pathUsed: filePath };
      }
    } catch {
      continue;
    }
  }
  return { defaultAgentId: undefined, profiles: [], pathUsed: null };
}

let cache: {
  profiles: AgentProfile[];
  defaultAgentId: string;
  source: "file" | "builtin";
  pathUsed: string | null;
  until: number;
} | null = null;

const CACHE_MS = 4000;

export function invalidateAgentProfilesCache(): void {
  cache = null;
}

export async function getAgentProfiles(): Promise<{
  profiles: AgentProfile[];
  defaultAgentId: string;
  source: "file" | "builtin";
  pathUsed: string | null;
}> {
  if (cache && Date.now() < cache.until) {
    return {
      profiles: cache.profiles,
      defaultAgentId: cache.defaultAgentId,
      source: cache.source,
      pathUsed: cache.pathUsed,
    };
  }

  const fromDisk = await readAgentsFromDisk();
  if (fromDisk.profiles.length > 0) {
    const def =
      fromDisk.defaultAgentId &&
      fromDisk.profiles.some((p) => p.id === fromDisk.defaultAgentId)
        ? fromDisk.defaultAgentId
        : fromDisk.profiles[0].id;
    cache = {
      profiles: fromDisk.profiles,
      defaultAgentId: def,
      source: "file",
      pathUsed: fromDisk.pathUsed,
      until: Date.now() + CACHE_MS,
    };
    return {
      profiles: fromDisk.profiles,
      defaultAgentId: def,
      source: "file",
      pathUsed: fromDisk.pathUsed,
    };
  }

  const def = BUILTIN[0]?.id ?? FALLBACK_DEFAULT_AGENT_ID;
  cache = {
    profiles: BUILTIN,
    defaultAgentId: def,
    source: "builtin",
    pathUsed: null,
    until: Date.now() + CACHE_MS,
  };
  return { profiles: BUILTIN, defaultAgentId: def, source: "builtin", pathUsed: null };
}

export async function resolveAgentProfile(
  agentId: string | undefined
): Promise<AgentProfile> {
  const { profiles, defaultAgentId } = await getAgentProfiles();
  const id = agentId?.trim();
  if (id) {
    const p = profiles.find((a) => a.id === id);
    if (p) return p;
  }
  return (
    profiles.find((a) => a.id === defaultAgentId) ?? profiles[0]
  ) as AgentProfile;
}

/** Modell für die API: Profil, sonst Env, sonst lokaler Fallback */
export function resolveModelForProfile(profile: AgentProfile): string {
  const fromProfile = profile.model?.trim();
  if (fromProfile) return fromProfile;
  const env = process.env.OPENAI_MODEL?.trim();
  if (env) return env;
  return "llama3.2";
}

export function resolveMaxToolRounds(profile: AgentProfile): number | undefined {
  if (typeof profile.maxToolRounds === "number" && Number.isFinite(profile.maxToolRounds)) {
    return Math.min(80, Math.max(4, Math.floor(profile.maxToolRounds)));
  }
  return undefined;
}
