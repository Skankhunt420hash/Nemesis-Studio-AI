"use client";

import dynamic from "next/dynamic";
import type * as MonacoNs from "monaco-editor";
import { useEffect, useMemo, useRef } from "react";

const Monaco = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-[13px] text-[#858585]">
      Editor wird geladen…
    </div>
  ),
});

export function languageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    mts: "typescript",
    cts: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    md: "markdown",
    mdx: "markdown",
    css: "css",
    scss: "scss",
    less: "less",
    html: "html",
    htm: "html",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    kt: "kotlin",
    kts: "kotlin",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    h: "c",
    sql: "sql",
    sh: "shell",
    ps1: "powershell",
    toml: "ini",
    ini: "ini",
  };
  return map[ext] ?? "plaintext";
}

export function CodeEditor({
  path,
  value,
  onChange,
  readOnly,
  onCursorPosition,
  ghostLineNumbers,
}: {
  path: string | null;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
  onCursorPosition?: (pos: { line: number; column: number } | null) => void;
  /** 1-basierte Zeilen für dezente Hervorhebung (z. B. nach Agent-Lauf). */
  ghostLineNumbers?: readonly number[] | null;
}) {
  const cursorCleanupRef = useRef<(() => void) | null>(null);
  const editorRef = useRef<MonacoNs.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof MonacoNs | null>(null);
  const ghostDecoIdsRef = useRef<string[]>([]);

  const lang = useMemo(
    () => (path ? languageFromPath(path) : "plaintext"),
    [path]
  );

  const editorPath = path ?? "untitled";

  useEffect(() => {
    if (!path) onCursorPosition?.(null);
  }, [path, onCursorPosition]);

  useEffect(
    () => () => {
      cursorCleanupRef.current?.();
      cursorCleanupRef.current = null;
    },
    []
  );

  const ghostKey = ghostLineNumbers?.join(",") ?? "";

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const lines = ghostLineNumbers?.filter((n) => n > 0) ?? [];
    if (lines.length === 0) {
      ghostDecoIdsRef.current = editor.deltaDecorations(ghostDecoIdsRef.current, []);
      return;
    }
    const decos: MonacoNs.editor.IModelDeltaDecoration[] = lines.map((ln) => ({
      range: new monaco.Range(ln, 1, ln, 1),
      options: {
        isWholeLine: true,
        className: "nemesis-ghost-line",
        marginClassName: "nemesis-ghost-line-margin",
      },
    }));
    ghostDecoIdsRef.current = editor.deltaDecorations(ghostDecoIdsRef.current, decos);
  }, [path, ghostKey, ghostLineNumbers]);

  if (!path) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-[#858585]">
        Datei im Explorer wählen oder den Agenten beauftragen.
      </div>
    );
  }

  return (
    <Monaco
      height="100%"
      theme="vs-dark"
      path={editorPath}
      defaultLanguage={lang}
      language={lang}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      onMount={(editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        cursorCleanupRef.current?.();
        const emit = () => {
          const p = editor.getPosition();
          onCursorPosition?.(
            p ? { line: p.lineNumber, column: p.column } : null
          );
        };
        emit();
        const sub = editor.onDidChangeCursorPosition(emit);
        cursorCleanupRef.current = () => {
          sub.dispose();
          onCursorPosition?.(null);
          editorRef.current = null;
          monacoRef.current = null;
          ghostDecoIdsRef.current = editor.deltaDecorations(ghostDecoIdsRef.current, []);
        };
      }}
      options={{
        readOnly: readOnly === true,
        minimap: { enabled: true },
        fontSize: 13,
        wordWrap: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        padding: { top: 8 },
      }}
    />
  );
}
