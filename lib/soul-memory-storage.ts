import {
  SOUL_MEMORY_STORAGE_KEY,
  emptySoulMemory,
  type SoulMemoryState,
} from "./soul-memory-types";

export function loadSoulMemoryFromBrowser(): SoulMemoryState {
  if (typeof window === "undefined") return emptySoulMemory();
  try {
    const raw = localStorage.getItem(SOUL_MEMORY_STORAGE_KEY);
    if (!raw) return emptySoulMemory();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return emptySoulMemory();
    const o = parsed as Record<string, unknown>;
    return {
      version: 1,
      updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
      appKinds: typeof o.appKinds === "string" ? o.appKinds : "",
      recurringMistakes: typeof o.recurringMistakes === "string" ? o.recurringMistakes : "",
      designPreferences: typeof o.designPreferences === "string" ? o.designPreferences : "",
      codeStyle: typeof o.codeStyle === "string" ? o.codeStyle : "",
      projectVision: typeof o.projectVision === "string" ? o.projectVision : "",
      learnedNotes: Array.isArray(o.learnedNotes)
        ? o.learnedNotes.filter((x): x is string => typeof x === "string")
        : [],
      autoLearnFromTurn: o.autoLearnFromTurn === true,
    };
  } catch {
    return emptySoulMemory();
  }
}

export function saveSoulMemoryToBrowser(s: SoulMemoryState): void {
  if (typeof window === "undefined") return;
  try {
    const next = { ...s, updatedAt: new Date().toISOString() };
    localStorage.setItem(SOUL_MEMORY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}
