"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PaletteAction = { id: string; label: string; hint?: string; run: () => void };

export function CommandPalette({
  open,
  onClose,
  files,
  onOpenFile,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  files: string[];
  onOpenFile: (path: string) => void;
  actions: PaletteAction[];
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [sel, setSel] = useState(0);

  const fileItems = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return files.slice(0, 80);
    return files
      .filter((f) => f.toLowerCase().includes(t))
      .slice(0, 80);
  }, [files, q]);

  const actionItems = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return actions;
    return actions.filter(
      (a) =>
        a.label.toLowerCase().includes(t) ||
        (a.hint && a.hint.toLowerCase().includes(t))
    );
  }, [actions, q]);

  const rows = useMemo(() => {
    type Row = { kind: "action" | "file"; label: string; hint?: string; run: () => void };
    const r: Row[] = [];
    for (const a of actionItems) {
      r.push({
        kind: "action",
        label: a.label,
        hint: a.hint,
        run: () => {
          a.run();
          onClose();
        },
      });
    }
    for (const f of fileItems) {
      r.push({
        kind: "file",
        label: f,
        hint: "Datei öffnen",
        run: () => {
          onOpenFile(f);
          onClose();
        },
      });
    }
    return r;
  }, [actionItems, fileItems, onClose, onOpenFile]);

  /* eslint-disable react-hooks/set-state-in-effect -- Eingabe und Auswahl beim Öffnen/Schließen der Palette zurücksetzen */
  useEffect(() => {
    if (!open) {
      setQ("");
      setSel(0);
      return;
    }
    setSel(0);
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const safeSel = rows.length === 0 ? 0 : Math.min(sel, rows.length - 1);

  const runSelected = useCallback(() => {
    const row = rows[safeSel];
    if (row) row.run();
  }, [rows, safeSel]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 pt-[12vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Befehlspalette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-lg border border-[#3c3c3c] bg-[#252526] shadow-2xl">
        <div className="border-b border-[#3c3c3c] px-3 py-2">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(Math.max(0, rows.length - 1), s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                runSelected();
              }
            }}
            placeholder="Befehl oder Dateipfad…"
            className="w-full bg-transparent text-[14px] text-[#cccccc] outline-none placeholder:text-[#6a6a6a]"
          />
        </div>
        <div className="max-h-[min(50vh,420px)] overflow-y-auto py-1">
          {rows.length === 0 ? (
            <p className="px-3 py-4 text-[13px] text-[#858585]">Keine Treffer.</p>
          ) : (
            rows.map((row, i) => (
              <button
                key={`${row.kind}-${row.label}-${i}`}
                type="button"
                onMouseEnter={() => setSel(i)}
                onClick={() => row.run()}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] ${
                  i === safeSel ? "bg-[#094771] text-[#ffffff]" : "text-[#cccccc] hover:bg-[#2a2d2e]"
                }`}
              >
                <span className="min-w-0 truncate font-mono text-[12px]">{row.label}</span>
                {row.hint ? (
                  <span
                    className={`shrink-0 text-[11px] ${i === safeSel ? "text-[#b8d7f0]" : "text-[#858585]"}`}
                  >
                    {row.hint}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
        <div className="border-t border-[#3c3c3c] px-3 py-1.5 text-[11px] text-[#858585]">
          ↑↓ wählen · Enter ausführen · Esc schließen
        </div>
      </div>
    </div>
  );
}
