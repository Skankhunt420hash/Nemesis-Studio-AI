import { randomBytes } from "node:crypto";
import * as pty from "node-pty";
import { getWorkspaceRoot } from "@/lib/workspace";

export type TerminalSessionRecord = {
  id: string;
  pty: pty.IPty;
  created: number;
  lastTouch: number;
  exited: boolean;
  subscribers: Set<(chunk: string) => void>;
  unsubData: () => void;
  unsubExit: () => void;
};

const sessions = new Map<string, TerminalSessionRecord>();

const IDLE_MS = 45 * 60 * 1000;
const MAX_SESSIONS = 6;
const MAX_COLS = 240;
const MAX_ROWS = 120;

let sweepTimer: ReturnType<typeof setInterval> | null = null;

function ensureSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (s.exited) {
        destroySession(id);
        continue;
      }
      if (now - s.lastTouch > IDLE_MS) destroySession(id);
    }
  }, 60_000);
}

export function destroySession(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  s.subscribers.clear();
  try {
    s.unsubData();
  } catch {
    /* ignore */
  }
  try {
    s.unsubExit();
  } catch {
    /* ignore */
  }
  try {
    s.pty.kill();
  } catch {
    /* ignore */
  }
}

function evictOldestIfNeeded() {
  if (sessions.size < MAX_SESSIONS) return;
  let oldest: { id: string; t: number } | null = null;
  for (const [id, s] of sessions) {
    if (!oldest || s.created < oldest.t) oldest = { id, t: s.created };
  }
  if (oldest) destroySession(oldest.id);
}

export function createTerminalSession(cols: number, rows: number): {
  id: string;
  shell: string;
} {
  ensureSweep();
  evictOldestIfNeeded();

  const id = randomBytes(18).toString("hex");
  const cwd = getWorkspaceRoot();
  const c = Math.max(20, Math.min(Math.floor(cols) || 80, MAX_COLS));
  const r = Math.max(5, Math.min(Math.floor(rows) || 24, MAX_ROWS));

  const isWin = process.platform === "win32";
  const shell = isWin ? "powershell.exe" : process.env.SHELL || "/bin/bash";
  const args = isWin ? ["-NoLogo", "-NoProfile"] : [];

  const child = pty.spawn(shell, args, {
    name: "xterm-256color",
    cols: c,
    rows: r,
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    } as NodeJS.ProcessEnv,
    ...(isWin ? { useConpty: true } : {}),
  });

  const record: TerminalSessionRecord = {
    id,
    pty: child,
    created: Date.now(),
    lastTouch: Date.now(),
    exited: false,
    subscribers: new Set(),
    unsubData: () => {},
    unsubExit: () => {},
  };

  const d1 = child.onData((data) => {
    record.lastTouch = Date.now();
    for (const fn of record.subscribers) {
      try {
        fn(data);
      } catch {
        /* ignore */
      }
    }
  });

  const d2 = child.onExit(() => {
    if (!sessions.has(id)) return;
    sessions.delete(id);
    record.exited = true;
    const msg = "\r\n\x1b[33m[Shell beendet]\x1b[0m\r\n";
    for (const fn of record.subscribers) {
      try {
        fn(msg);
      } catch {
        /* ignore */
      }
    }
    record.subscribers.clear();
    try {
      d1.dispose();
    } catch {
      /* ignore */
    }
    try {
      d2.dispose();
    } catch {
      /* ignore */
    }
  });

  record.unsubData = () => d1.dispose();
  record.unsubExit = () => d2.dispose();

  sessions.set(id, record);
  return { id, shell };
}

export function getSession(id: string): TerminalSessionRecord | undefined {
  return sessions.get(id);
}

export function subscribeSession(
  id: string,
  fn: (chunk: string) => void
): (() => void) | null {
  const s = sessions.get(id);
  if (!s || s.exited) return null;
  s.subscribers.add(fn);
  s.lastTouch = Date.now();
  return () => {
    s.subscribers.delete(fn);
  };
}

export function writeSession(id: string, data: string): boolean {
  const s = sessions.get(id);
  if (!s || s.exited) return false;
  s.lastTouch = Date.now();
  try {
    s.pty.write(data);
    return true;
  } catch {
    return false;
  }
}

export function resizeSession(id: string, cols: number, rows: number): boolean {
  const s = sessions.get(id);
  if (!s || s.exited) return false;
  const c = Math.max(2, Math.min(Math.floor(cols) || 80, MAX_COLS));
  const r = Math.max(1, Math.min(Math.floor(rows) || 24, MAX_ROWS));
  try {
    s.pty.resize(c, r);
    s.lastTouch = Date.now();
    return true;
  } catch {
    return false;
  }
}
