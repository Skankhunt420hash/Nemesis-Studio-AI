/** Nur Typen/Konstanten — für Client-Komponenten importierbar (ohne fs). */

export type AgentProfile = {
  id: string;
  label: string;
  description: string;
  model: string;
  systemExtension: string;
  /** Optional: mehr Tool-Runden (z. B. Fast Rocket). Standard: Server-Default. */
  maxToolRounds?: number;
};

export const FALLBACK_DEFAULT_AGENT_ID = "coder";
