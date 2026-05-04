import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { ensureWorkspaceExists, resolveWorkspacePath } from "@/lib/workspace";
import { MAX_NEMESIS_DROP_BYTES } from "@/lib/workspace-upload-limits";

export const runtime = "nodejs";

function maxDropBytes(): number {
  const raw = process.env.NEMESIS_DROP_MAX_MB?.trim();
  if (!raw) return MAX_NEMESIS_DROP_BYTES;
  const mb = Number(raw);
  if (!Number.isFinite(mb) || mb <= 0) return MAX_NEMESIS_DROP_BYTES;
  return Math.min(500 * 1024 * 1024, Math.max(5, mb) * 1024 * 1024);
}

function safeBasename(name: string): string {
  const b = path
    .basename(name)
    .replace(/[^a-zA-Z0-9._\s-]+/g, "_")
    .replace(/\s+/g, "_");
  return (b || "drop").slice(0, 128);
}

export async function POST(req: Request) {
  await ensureWorkspaceExists();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Kein FormData." }, { status: 400 });
  }

  const entry = form.get("file");
  if (!(entry instanceof File)) {
    return NextResponse.json({ error: "Formularfeld „file“ erforderlich." }, { status: 400 });
  }

  const maxBytes = maxDropBytes();
  if (entry.size > maxBytes) {
    return NextResponse.json(
      {
        error: `Datei zu groß (max. ${Math.round(maxBytes / (1024 * 1024))} MB).`,
      },
      { status: 413 }
    );
  }

  const buf = Buffer.from(await entry.arrayBuffer());
  const base = safeBasename(entry.name);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${base}`;
  const rel = `.nemesis-drops/${unique}`.split(path.sep).join("/");

  try {
    const abs = resolveWorkspacePath(rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buf);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ path: rel });
}
