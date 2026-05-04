"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";

function decodeB64Utf8(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

type LayoutWatch = {
  ro: ResizeObserver;
  pending: ReturnType<typeof setTimeout> | null;
};

export function TerminalPanel() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const termApiRef = useRef<{
    term: import("@xterm/xterm").Terminal;
    fit: import("@xterm/addon-fit").FitAddon;
    es: EventSource;
  } | null>(null);
  const layoutRef = useRef<LayoutWatch | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<string>("Starte…");
  const [error, setError] = useState<string | null>(null);

  const dispose = useCallback(async () => {
    const lw = layoutRef.current;
    layoutRef.current = null;
    if (lw) {
      if (lw.pending) clearTimeout(lw.pending);
      try {
        lw.ro.disconnect();
      } catch {
        /* ignore */
      }
    }

    const t = termApiRef.current;
    termApiRef.current = null;
    if (t) {
      try {
        t.es.close();
      } catch {
        /* ignore */
      }
      try {
        t.term.dispose();
      } catch {
        /* ignore */
      }
    }
    const id = sessionIdRef.current;
    sessionIdRef.current = null;
    if (id) {
      try {
        await fetch(`/api/terminal/session?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
      } catch {
        /* ignore */
      }
    }
  }, []);

  const boot = useCallback(async () => {
    await dispose();
    setError(null);
    setStatus("Starte…");

    const el = termRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;

    const { Terminal } = await import("@xterm/xterm");
    const { FitAddon } = await import("@xterm/addon-fit");
    await import("@xterm/xterm/css/xterm.css");

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "Consolas, 'Cascadia Mono', monospace",
      theme: {
        background: "#1e1e1e",
        foreground: "#d4d4d4",
        cursor: "#aeafad",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();

    const cols = term.cols;
    const rows = term.rows;

    const res = await fetch("/api/terminal/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cols, rows }),
    });
    const data = (await res.json()) as { id?: string; error?: string; shell?: string };
    if (!res.ok || !data.id) {
      const msg = data.error ?? `HTTP ${res.status}`;
      setError(msg);
      setStatus("Fehler");
      term.dispose();
      return;
    }

    sessionIdRef.current = data.id;
    setStatus(data.shell ?? "Shell");

    const es = new EventSource(
      `/api/terminal/stream?id=${encodeURIComponent(data.id)}`
    );

    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { t?: string; d?: string };
        if (msg.t === "ready") return;
        if (msg.t === "o" && msg.d) {
          term.write(decodeB64Utf8(msg.d));
        }
      } catch {
        /* ignore malformed */
      }
    };

    es.onerror = () => {
      try {
        es.close();
      } catch {
        /* ignore */
      }
      setStatus("Stream getrennt — „Neu starten“");
    };

    term.onData((payload) => {
      const id = sessionIdRef.current;
      if (!id) return;
      void fetch("/api/terminal/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, data: payload }),
      }).catch(() => {
        /* ignore */
      });
    });

    const postResize = () => {
      const id = sessionIdRef.current;
      if (!id) return;
      try {
        fit.fit();
      } catch {
        return;
      }
      void fetch("/api/terminal/resize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, cols: term.cols, rows: term.rows }),
      }).catch(() => {
        /* ignore */
      });
    };

    const layout: LayoutWatch = {
      ro: new ResizeObserver(() => {
        if (layout.pending) clearTimeout(layout.pending);
        layout.pending = setTimeout(() => {
          layout.pending = null;
          postResize();
        }, 120);
      }),
      pending: null,
    };
    layout.ro.observe(wrap);
    layoutRef.current = layout;

    termApiRef.current = { term, fit, es };

    queueMicrotask(() => postResize());
    setStatus("Verbunden");
  }, [dispose]);

  useEffect(() => {
    startTransition(() => {
      void boot();
    });
    return () => {
      void dispose();
    };
  }, [boot, dispose]);

  const restart = useCallback(() => {
    void boot();
  }, [boot]);

  return (
    <div ref={wrapRef} className="flex h-full min-h-0 flex-col border-t border-[#3c3c3c] bg-[#1e1e1e]">
      <div className="flex h-8 shrink-0 flex-col justify-center border-b border-[#3c3c3c] bg-[#252526] px-2 py-0.5 text-[11px] text-[#858585] sm:flex-row sm:items-center sm:justify-between">
        <span>
          <span className="font-semibold text-[#cccccc]">Terminal</span>
          <span className="mx-1.5 text-[#454545]">·</span>
          <span className="text-[#569cd6]">{status}</span>
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => restart()}
            className="rounded px-2 py-0.5 text-[11px] text-[#cccccc] hover:bg-[#2a2d2e]"
          >
            Neu starten
          </button>
        </div>
      </div>
      {error ? (
        <div className="shrink-0 border-b border-[#f14c4c]/30 bg-[#3c1e1e] px-2 py-1 text-[11px] text-[#f48771]">
          {error}
        </div>
      ) : null}
      <div ref={termRef} className="min-h-0 flex-1 overflow-hidden p-1" />
    </div>
  );
}
