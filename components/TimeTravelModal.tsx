"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { languageFromPath } from "@/components/CodeEditor";

const DiffEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.DiffEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[65vh] items-center justify-center text-[13px] text-[#858585]">
        Zeitreise-Diff lädt…
      </div>
    ),
  }
);

export function TimeTravelModal({
  open,
  path,
  versions,
  currentContent,
  onClose,
}: {
  open: boolean;
  path: string;
  /** Chronologisch: ältere Snapshots zuerst, jeweils Stand *vor* einer Änderung. */
  versions: string[];
  currentContent: string;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);

  const n = versions.length;
  const { left, right, label } = useMemo(() => {
    if (n === 0) {
      return { left: "", right: currentContent, label: "Keine Snapshots" };
    }
    const i = Math.min(Math.max(0, idx), n - 1);
    const left = versions[i] ?? "";
    const right = i + 1 < n ? (versions[i + 1] ?? "") : currentContent;
    const label =
      i + 1 < n
        ? `Snapshot ${i + 1} → ${i + 2}`
        : `Snapshot ${i + 1} → aktuell (Editor/Disk)`;
    return { left, right, label };
  }, [n, versions, currentContent, idx]);

  if (!open) return null;

  const lang = languageFromPath(path);
  const maxIdx = Math.max(0, n - 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="timetravel-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-lg border border-[#3c3c3c] bg-[#1e1e1e] shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[#3c3c3c] px-3 py-2">
          <h2 id="timetravel-title" className="truncate text-[13px] font-medium text-[#cccccc]">
            Zeitreise · <span className="font-mono text-[#569cd6]">{path}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-[12px] text-[#858585] hover:bg-[#2a2d2e] hover:text-[#cccccc]"
          >
            Schließen
          </button>
        </div>
        <div className="shrink-0 space-y-2 border-b border-[#3c3c3c] px-3 py-2">
          <p className="text-[11px] text-[#858585]">{label}</p>
          {n > 0 ? (
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={maxIdx}
                step={1}
                value={Math.min(idx, maxIdx)}
                onChange={(e) => setIdx(Number(e.target.value))}
                className="min-w-0 flex-1 accent-[#007fd4]"
              />
              <span className="shrink-0 font-mono text-[11px] text-[#569cd6]">
                {Math.min(idx, maxIdx) + 1}/{maxIdx + 1}
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-[#dcdcaa]">
              Nach Agent-Läufen mit Änderungen an dieser Datei erscheinen hier Snapshots.
            </p>
          )}
        </div>
        <div className="min-h-0 flex-1">
          <DiffEditor
            height="65vh"
            theme="vs-dark"
            language={lang}
            original={left}
            modified={right}
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              fontSize: 12,
              wordWrap: "on",
            }}
          />
        </div>
      </div>
    </div>
  );
}
