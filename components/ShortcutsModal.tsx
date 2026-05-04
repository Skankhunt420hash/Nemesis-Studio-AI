"use client";

import { useEffect } from "react";

const ROWS: [string, string][] = [
  ["Schnellzugriff / Dateien", "Ctrl+P oder ⌘P"],
  ["Speichern", "Ctrl+S oder ⌘S"],
  ["Tastenkürzel", "Ctrl+/ oder ⌘/"],
  ["Agent senden", "Enter (Shift+Enter Zeilenumbruch)"],
  ["Panelbreiten", "Ziehen an den Trennlinien"],
];

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Tastenkürzel"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-[#3c3c3c] bg-[#252526] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#3c3c3c] px-4 py-3">
          <h2 className="text-[14px] font-semibold text-[#cccccc]">Tastenkürzel</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-[12px] text-[#858585] hover:bg-[#3c3c3c] hover:text-[#cccccc]"
          >
            Schließen
          </button>
        </div>
        <table className="w-full text-[13px]">
          <tbody>
            {ROWS.map(([action, keys]) => (
              <tr key={action} className="border-b border-[#3c3c3c] last:border-0">
                <td className="px-4 py-2 text-[#cccccc]">{action}</td>
                <td className="px-4 py-2 text-right font-mono text-[12px] text-[#569cd6]">{keys}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-[#3c3c3c] px-4 py-2 text-[11px] text-[#858585]">
          Esc schließt dieses Fenster.
        </p>
      </div>
    </div>
  );
}
