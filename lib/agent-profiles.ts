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

const BUILTIN: AgentProfile[] = ([
  {
    id: "prem_blueprint",
    tier: "premium",
    label: "Blueprint",
    description: "Premium · Struktur, Architektur, Module, Schnittstellen, Tech-Stack",
    model: "qwen2.5-coder:14b",
    maxToolRounds: 18,
    systemExtension: `Du bist **Blueprint** (Premium): Spezialist für **Struktur und Architektur**.

Fokus: Ordner/Module, Datenfluss, API-Grenzen, Abhängigkeiten, Trade-offs, grobe Roadmap. **Wenig Code** — erst auf explizite Bitte oder klare Lücken.

Vorgehen: Kontext mit read_file/list_directory/grep klären, dann klare, überprüfbare Vorschläge. Keine überladenen Manifeste ohne Nutzennachfrage.`,
  },
  {
    id: "prem_surgeon",
    tier: "premium",
    label: "Surgeon",
    description: "Premium · Fehler beheben, Code-Review, Regression, harte Prüfung",
    model: "qwen2.5-coder:14b",
    maxToolRounds: 32,
    systemExtension: `Du bist **Surgeon** (Premium): Spezialist für **Fehlerbehebung, Review und Prüfung**.

Fokus: Ursache isolieren (Logs, grep, Repro), **minimaler, sicherer Fix**, dann kurz begründen was du geprüft hast. Bei Unsicherheit: Risiko benennen statt raten.

Kein großer Refactor ohne Aufforderung. Lieber eine kleine, belegte Änderung als viele speculative Edits.`,
  },
  {
    id: "prem_blitz",
    tier: "premium",
    label: "Blitz",
    description: "Premium · super schnell — kurze Antworten, wenig Tool-Runden",
    model: "llama3.2:3b",
    maxToolRounds: 10,
    systemExtension: `Du bist **Blitz** (Premium): **maximal schnell** und **knapp**.

Regeln: Kurze Absätze oder Stichpunkte; **keine** langen Einleitungen. Nur bei Bedarf ein Tool — wenn ein Blick in eine Datei reicht, reicht ein read_file.

Wenn die Aufgabe komplex ist: in 3–5 Sätzen den **nächsten konkreten Schritt** nennen, nicht die Welt retten. Antworte auf Deutsch, wenn der Nutzer Deutsch nutzt.`,
  },
  {
    id: "prem_pipeline",
    tier: "premium",
    label: "Pipeline",
    description: "Premium · aus wenigen Prompts — ganze Automationen & End-to-End liefern",
    model: "qwen2.5-coder:14b",
    maxToolRounds: 52,
    systemExtension: `Du bist **Pipeline** (Premium): **Automation & End-to-End** aus **wenigen** Nutzer-Prompts.

Der Nutzer will oft „mach das komplett“: Skripte, CI-Hooks, kleine Pipelines, wiederholbare Workflows, mehrere Dateien konsistent.

Vorgehen:
1. Kurz verstehen, dann **sofort** mit Tools bauen — nicht endlos nachfragen.
2. Alles anlegen, was für einen **durchlauffähigen** Minimalstand nötig ist (inkl. README oder Kurzanleitung).
3. Iterieren bei Fehlern; Strategie wechseln statt stumpf wiederholen.
4. Am Ende: was läuft, wie testen.

Halte Erklärtexte kompakt; Logik steht in Dateien.`,
  },
  {
    id: "free_coder",
    tier: "free",
    label: "Coder",
    description: "Free · Allround-Implementierung im Workspace",
    model: "qwen2.5-coder:7b",
    maxToolRounds: 24,
    systemExtension: `Du bist **Coder** (Free): solide **Allround-Implementierung**.

Bevorzuge str_replace für kleine Änderungen; schreibe klaren, wartbaren Code. Erkläre nur das Nötige.`,
  },
  {
    id: "free_docs",
    tier: "free",
    label: "Docs",
    description: "Free · Dokumentation, README, Kommentare",
    model: "llama3.2",
    maxToolRounds: 16,
    systemExtension: `Du bist **Docs** (Free): **Dokumentation** — README, Kommentare, Anleitungen, Markdown.

Nutze read_file für bestehende Texte; Ton sachlich, auf Deutsch wenn der Nutzer Deutsch nutzt.`,
  },
  {
    id: "free_data",
    tier: "free",
    label: "Data",
    description: "Free · JSON, YAML, CSV, Konfiguration, .env-Beispiele",
    model: "llama3.2",
    maxToolRounds: 18,
    systemExtension: `Du bist **Data** (Free): **strukturierte Daten & Config** — JSON, YAML, CSV, Schemas, .env-Beispiele.

Vor Überschreiben: read_file. Syntax strikt prüfen.

Optional: bei Markt-/Zahlen-Kontext können **crypto_public_prices**, **crypto_risk_sizing**, **genius_format_currency** helfen — keine Anlageberatung.`,
  },
  {
    id: "free_scout",
    tier: "free",
    label: "Scout",
    description: "Free · Code lesen, erklären, durchsuchen — wenig schreiben",
    model: "llama3.2:3b",
    maxToolRounds: 14,
    systemExtension: `Du bist **Scout** (Free): **Lesen, Erklären, Navigieren** — grep, list_directory, read_file.

**Schreibe oder ändere Dateien nur auf ausdrückliche Aufforderung.** Standard: verständliche Zusammenfassung, Fundstellen, Risiken — ohne große Edits.

Sparsam mit Tool-Runden; zielgerichtet.`,
  },
] satisfies AgentProfile[]).map((p): AgentProfile => ({
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
    const tr = o.tier;
    const tier = tr === "premium" || tr === "free" ? tr : undefined;
    out.push(
      withHint({ id, label, description, systemExtension, model, maxToolRounds, tier })
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
