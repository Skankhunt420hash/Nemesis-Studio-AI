import type { SoulMemoryState } from "./soul-memory-types";

const MAX_FIELD = 3500;
const MAX_NOTES = 28;
const MAX_NOTE_LEN = 320;

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n… (gekürzt)`;
}

export function normalizeSoulMemoryFromClient(raw: unknown): SoulMemoryState | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const str = (k: string) => (typeof o[k] === "string" ? clip(String(o[k]), MAX_FIELD) : "");

  const notes: string[] = [];
  if (Array.isArray(o.learnedNotes)) {
    for (const x of o.learnedNotes) {
      if (typeof x !== "string") continue;
      const t = clip(x, MAX_NOTE_LEN);
      if (!t || notes.includes(t)) continue;
      notes.push(t);
      if (notes.length >= MAX_NOTES) break;
    }
  }

  const out: SoulMemoryState = {
    version: 1,
    updatedAt:
      typeof o.updatedAt === "string" && o.updatedAt.trim()
        ? o.updatedAt.trim().slice(0, 40)
        : new Date().toISOString(),
    appKinds: str("appKinds"),
    recurringMistakes: str("recurringMistakes"),
    designPreferences: str("designPreferences"),
    codeStyle: str("codeStyle"),
    projectVision: str("projectVision"),
    learnedNotes: notes,
    autoLearnFromTurn: o.autoLearnFromTurn === true,
  };

  const has =
    out.appKinds ||
    out.recurringMistakes ||
    out.designPreferences ||
    out.codeStyle ||
    out.projectVision ||
    out.learnedNotes.length > 0;
  return has ? out : null;
}

export function appendSoulMemoryToSystem(
  systemContent: string,
  soul: SoulMemoryState | null
): string {
  if (!soul) return systemContent;

  const lines: string[] = [
    "",
    "## Soul Memory (Nur für dich, Agent)",
    "Das folgende Profil beschreibt **Arbeitsweise und Präferenzen** des Nutzers über viele Sessions hinweg.",
    "Respektiere es, wo es sinnvoll ist. **Widerspricht** die aktuelle Nutzernachricht explizit dem Profil, **gewinnt immer die aktuelle Nachricht**.",
    "",
  ];

  if (soul.appKinds) lines.push(`**Bevorzugte App-/Projektarten:**\n${soul.appKinds}`, "");
  if (soul.recurringMistakes) lines.push(`**Typische Stolperfallen / Fehlerbilder:**\n${soul.recurringMistakes}`, "");
  if (soul.designPreferences) lines.push(`**Design & UX:**\n${soul.designPreferences}`, "");
  if (soul.codeStyle) lines.push(`**Codestil & Konventionen:**\n${soul.codeStyle}`, "");
  if (soul.projectVision) lines.push(`**Projekt-Vision:**\n${soul.projectVision}`, "");
  if (soul.learnedNotes.length) {
    lines.push(
      "**Session-Schnipsel (chronologisch, gekürzt):**",
      ...soul.learnedNotes.map((n, i) => `${i + 1}. ${n}`),
      ""
    );
  }

  lines.push(`_Soul Memory Stand: ${soul.updatedAt}_`);

  return `${systemContent.trimEnd()}\n${lines.join("\n")}`;
}
