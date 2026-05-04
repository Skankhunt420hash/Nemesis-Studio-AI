import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { resolveWorkspacePath, ensureWorkspaceExists } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rel = url.searchParams.get("path") ?? "";
  if (!rel.trim()) {
    return NextResponse.json({ error: "path fehlt" }, { status: 400 });
  }
  await ensureWorkspaceExists();
  try {
    const full = resolveWorkspacePath(rel);
    const content = await fs.readFile(full, "utf-8");
    return NextResponse.json({ path: rel, content });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 404 });
  }
}

export async function POST(req: Request) {
  let body: { path?: string; content?: string };
  try {
    body = (await req.json()) as { path?: string; content?: string };
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const rel = typeof body.path === "string" ? body.path.trim() : "";
  const content = typeof body.content === "string" ? body.content : "";
  if (!rel) {
    return NextResponse.json({ error: "path fehlt" }, { status: 400 });
  }

  await ensureWorkspaceExists();
  try {
    const full = resolveWorkspacePath(rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf-8");
    return NextResponse.json({ ok: true, path: rel });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
