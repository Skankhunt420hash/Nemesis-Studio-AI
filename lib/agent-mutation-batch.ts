/**
 * Während einer Agent-Antwort alle Datei-Mutationen (write/str_replace/delete) sammeln,
 * um „Letzte Agent-Runde rückgängig“ zu ermöglichen.
 */

import fs from "node:fs/promises";
import type { UndoSnapshot } from "@/lib/agent-types";
import { resolveWorkspacePath } from "@/lib/workspace";

let active: Map<string, string | null> | null = null;

function normPath(p: string): string {
  return p.replace(/^[/\\]+/, "").replace(/\\/g, "/");
}

export function beginMutationBatch(): void {
  active = new Map();
}

export function discardMutationBatch(): void {
  active = null;
}

/** Vor einer mutierenden Operation aufrufen (nur erste Version pro Pfad zählt). */
export async function recordPathBeforeMutation(relPath: string): Promise<void> {
  if (!active) return;
  const p = normPath(relPath);
  if (!p || active.has(p)) return;
  const full = resolveWorkspacePath(p);
  try {
    const c = await fs.readFile(full, "utf-8");
    active.set(p, c);
  } catch {
    active.set(p, null);
  }
}

export function flushMutationBatch(): UndoSnapshot[] {
  if (!active) return [];
  const out: UndoSnapshot[] = [];
  for (const [path, content] of active) {
    out.push({ path, content });
  }
  active = null;
  return out;
}
