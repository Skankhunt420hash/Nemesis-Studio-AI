/** Soul Memory Engine — Nutzer-Präferenzen (lokal im Browser, optional an den Agent). */

export const SOUL_MEMORY_VERSION = 1 as const;

export type SoulMemoryState = {
  version: typeof SOUL_MEMORY_VERSION;
  /** ISO-Zeitpunkt der letzten Bearbeitung */
  updatedAt: string;
  /** Welche Art Apps / Projekte du bevorzugst */
  appKinds: string;
  /** Wiederkehrende Fehler oder Stolpersteine */
  recurringMistakes: string;
  /** Design-Sprache, UI-Ticks */
  designPreferences: string;
  /** Code-Stil, Patterns, Tabus */
  codeStyle: string;
  /** Vision / Nordstern des aktuellen Projekts */
  projectVision: string;
  /** Kurz-Schnipsel aus Sessions (wachsen kontrolliert mit) */
  learnedNotes: string[];
  /** Nach erfolgreicher Agent-Antwort letzte Nutzerzeile als Schnipsel anhängen */
  autoLearnFromTurn?: boolean;
};

export const SOUL_MEMORY_STORAGE_KEY = "nemesis_soul_memory_v1";

export function emptySoulMemory(): SoulMemoryState {
  return {
    version: SOUL_MEMORY_VERSION,
    updatedAt: new Date().toISOString(),
    appKinds: "",
    recurringMistakes: "",
    designPreferences: "",
    codeStyle: "",
    projectVision: "",
    learnedNotes: [],
    autoLearnFromTurn: false,
  };
}
