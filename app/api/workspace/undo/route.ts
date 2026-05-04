import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type { UndoSnapshot } from "@/lib/agent-types";
import { ensureWorkspaceExists, resolveWorkspacePath } from "@/lib/workspace";

export const runtime = "nodejs";

export async function POST(req: Request) {
  await ensureWorkspaceExists();
  let body: { snapshots?: UndoSnapshot[] };
  try {
    body = (await req.json()) as { snapshots?: UndoSnapshot[] };
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }
  const snaps = Array.isArray(body.snapshots) ? body.snapshots : [];
  if (snaps.length === 0) {
    return NextResponse.json({ error: "snapshots[] leer." }, { status: 400 });
  }

  try {
    for (const s of snaps) {
      if (!s || typeof s.path !== "string") continue;
      const rel = s.path.replace(/^[/\\]+/, "").replace(/\\/g, "/");
      if (!rel) continue;
      const abs = resolveWorkspacePath(rel);
      if (s.content === null) {
        try {
          await fs.unlink(abs);
        } catch {
          /* Datei existierte nicht */
        }
      } else {
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, s.content, "utf-8");
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, restored: snaps.length });
}
