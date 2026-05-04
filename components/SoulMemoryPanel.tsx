"use client";

import { useCallback, useState } from "react";
import type { SoulMemoryState } from "@/lib/soul-memory-types";
import { saveSoulMemoryToBrowser } from "@/lib/soul-memory-storage";

const MAX_NOTES = 28;
const MAX_NOTE = 320;

export function SoulMemoryPanel({
  value,
  onChange,
  getLastUserMessage,
}: {
  value: SoulMemoryState;
  onChange: (next: SoulMemoryState) => void;
  getLastUserMessage: () => string | null;
}) {
  const [open, setOpen] = useState(false);

  const persist = useCallback(
    (next: SoulMemoryState) => {
      onChange(next);
      saveSoulMemoryToBrowser(next);
    },
    [onChange]
  );

  const patch = (partial: Partial<SoulMemoryState>) => {
    persist({ ...value, ...partial, version: 1 });
  };

  const appendNote = (text: string) => {
    const t = text.trim().slice(0, MAX_NOTE);
    if (!t) return;
    const nextNotes = [...value.learnedNotes.filter((x) => x !== t), t].slice(-MAX_NOTES);
    patch({ learnedNotes: nextNotes });
  };

  const removeNote = (idx: number) => {
    patch({
      learnedNotes: value.learnedNotes.filter((_, i) => i !== idx),
    });
  };

  const filled =
    value.appKinds.trim() ||
    value.recurringMistakes.trim() ||
    value.designPreferences.trim() ||
    value.codeStyle.trim() ||
    value.projectVision.trim() ||
    value.learnedNotes.length > 0;

  return (
    <div className="border-b border-[#3c3c3c] bg-[#1e1e1e] px-2 py-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-[#2a2d2e]"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[#c586c0]">Soul Memory</span>
            {filled ? (
              <span className="rounded bg-[#68217a]/30 px-1.5 py-0.5 text-[9px] font-medium text-[#dcdcaa]">
                aktiv
              </span>
            ) : (
              <span className="text-[9px] text-[#6a6a6a]">leer</span>
            )}
          </div>
          <div className="truncate text-[10px] text-[#858585]">
            Denkweise, Stil, Vision — wird jeder Anfrage beigegeben (nur dieser Browser)
          </div>
        </div>
        <span className="shrink-0 rounded border border-[#454545] px-1.5 py-0.5 text-[10px] text-[#9cdcfe]">
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div className="mt-2 space-y-2 rounded-lg border border-[#68217a]/35 bg-[#252526] p-2">
          <p className="text-[10px] leading-snug text-[#858585]">
            Daten liegen in <span className="font-mono">localStorage</span> — nicht auf einem
            separaten Nemesis-Konto. Du kannst sie jederzeit löschen oder anpassen.
          </p>
          <Field
            label="App-Arten & Projekte, die du gern baust"
            value={value.appKinds}
            onChange={(appKinds) => patch({ appKinds })}
          />
          <Field
            label="Typische Fehler / Stolpersteine (bei dir)"
            value={value.recurringMistakes}
            onChange={(recurringMistakes) => patch({ recurringMistakes })}
          />
          <Field
            label="Design & UI, das du magst"
            value={value.designPreferences}
            onChange={(designPreferences) => patch({ designPreferences })}
          />
          <Field
            label="Codestil & Konventionen"
            value={value.codeStyle}
            onChange={(codeStyle) => patch({ codeStyle })}
          />
          <Field
            label="Vision hinter dem aktuellen Projekt"
            value={value.projectVision}
            onChange={(projectVision) => patch({ projectVision })}
          />
          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
              <span className="text-[10px] font-semibold text-[#9cdcfe]">
                Session-Schnipsel (wird mit der Zeit persönlicher)
              </span>
              <button
                type="button"
                onClick={() => {
                  const last = getLastUserMessage();
                  if (last) appendNote(last);
                }}
                className="rounded border border-[#454545] px-1.5 py-0.5 text-[9px] text-[#cccccc] hover:bg-[#2a2d2e]"
              >
                Letzte Nutzerfrage merken
              </button>
            </div>
            {value.learnedNotes.length === 0 ? (
              <p className="text-[10px] text-[#6a6a6a]">Noch keine Schnipsel.</p>
            ) : (
              <ul className="max-h-28 space-y-1 overflow-y-auto">
                {value.learnedNotes.map((n, i) => (
                  <li
                    key={`${i}-${n.slice(0, 24)}`}
                    className="flex items-start gap-1 rounded border border-[#3c3c3c] bg-[#1e1e1e] px-1.5 py-1 text-[10px] text-[#d4d4d4]"
                  >
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{n}</span>
                    <button
                      type="button"
                      className="shrink-0 text-[#858585] hover:text-[#f48771]"
                      aria-label="Entfernen"
                      onClick={() => removeNote(i)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-[10px] text-[#858585]">
            <input
              type="checkbox"
              checked={value.autoLearnFromTurn === true}
              onChange={(e) => patch({ autoLearnFromTurn: e.target.checked })}
              className="mt-0.5 accent-[#68217a]"
            />
            <span>
              Nach jeder <strong className="text-[#cccccc]">erfolgreichen</strong> Agent-Antwort die
              zuletzt gesendete Nutzerfrage automatisch als Schnipsel speichern (persönlicher mit der
              Zeit).
            </span>
          </label>
          <button
            type="button"
            onClick={() => {
              persist({
                version: 1,
                updatedAt: new Date().toISOString(),
                appKinds: "",
                recurringMistakes: "",
                designPreferences: "",
                codeStyle: "",
                projectVision: "",
                learnedNotes: [],
                autoLearnFromTurn: false,
              });
            }}
            className="text-[10px] text-[#858585] underline decoration-[#454545] hover:text-[#f48771]"
          >
            Soul Memory zurücksetzen
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-medium text-[#858585]">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full resize-y rounded border border-[#3c3c3c] bg-[#1e1e1e] px-2 py-1 text-[11px] text-[#cccccc] placeholder:text-[#6a6a6a]"
      />
    </label>
  );
}
