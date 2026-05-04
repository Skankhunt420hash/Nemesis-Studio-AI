import { NextResponse } from "next/server";
import { createTerminalSession, destroySession } from "@/lib/terminal-sessions";
import { ensureWorkspaceExists } from "@/lib/workspace";

export const runtime = "nodejs";

export async function POST(req: Request) {
  await ensureWorkspaceExists();
  let cols = 100;
  let rows = 28;
  try {
    const body = (await req.json()) as { cols?: number; rows?: number };
    if (typeof body.cols === "number") cols = body.cols;
    if (typeof body.rows === "number") rows = body.rows;
  } catch {
    /* Defaults */
  }
  try {
    const { id, shell } = createTerminalSession(cols, rows);
    return NextResponse.json({
      id,
      shell,
      cwd: "agent-workspace",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Terminal konnte nicht gestartet werden: ${message}` },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id erforderlich." }, { status: 400 });
  }
  destroySession(id);
  return NextResponse.json({ ok: true });
}
