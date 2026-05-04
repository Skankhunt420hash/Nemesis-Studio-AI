"use client";

import dynamic from "next/dynamic";
import { languageFromPath } from "@/components/CodeEditor";
import { formatDiffForVerhoer } from "@/lib/verhoer-diff-format";

const DiffEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.DiffEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[70vh] items-center justify-center text-[13px] text-[#858585]">
        Diff-Editor lädt…
      </div>
    ),
  }
);

export function DiffModal({
  open,
  path,
  original,
  modified,
  onClose,
  onVerhoer,
}: {
  open: boolean;
  path: string;
  original: string;
  modified: string;
  onClose: () => void;
  /** Text + Socratic-Flag an den Chat übergeben (nächste Nutzernachricht). */
  onVerhoer?: (payload: { socratic: boolean; appendix: string }) => void;
}) {
  if (!open) return null;

  const lang = languageFromPath(path);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="diff-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-lg border border-[#3c3c3c] bg-[#1e1e1e] shadow-xl">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#3c3c3c] px-3 py-2">
          <h2 id="diff-modal-title" className="min-w-0 truncate text-[13px] font-medium text-[#cccccc]">
            Diff · <span className="font-mono text-[#569cd6]">{path}</span>
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            {onVerhoer ? (
              <button
                type="button"
                title="Diff als Verhör in den nächsten Chat legen"
                onClick={() => {
                  onVerhoer({
                    socratic: true,
                    appendix: formatDiffForVerhoer(path, original, modified),
                  });
                  onClose();
                }}
                className="rounded border border-[#569cd6]/50 px-2 py-1 text-[11px] text-[#9cdcfe] hover:bg-[#2a2d2e]"
              >
                Verhör
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded px-2 py-1 text-[12px] text-[#858585] hover:bg-[#2a2d2e] hover:text-[#cccccc]"
            >
              Schließen
            </button>
          </div>
        </div>
        <p className="shrink-0 border-b border-[#3c3c3c] px-3 py-1.5 text-[11px] text-[#858585]">
          Links: Stand vor dem Agent-Lauf · Rechts: aktueller Stand auf der Festplatte
        </p>
        <div className="min-h-0 flex-1">
          <DiffEditor
            height="70vh"
            theme="vs-dark"
            language={lang}
            original={original}
            modified={modified}
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
