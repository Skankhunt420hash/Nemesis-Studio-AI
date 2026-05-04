import { NextResponse } from "next/server";
import { resizeSession } from "@/lib/terminal-sessions";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { id?: string; cols?: number; rows?: number };
  try {
    body = (await req.json()) as { id?: string; cols?: number; rows?: number };
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "id erforderlich." }, { status: 400 });
  }
  const ok = resizeSession(body.id, body.cols ?? 80, body.rows ?? 24);
  if (!ok) {
    return NextResponse.json({ ok: false }, { status: 410 });
  }
  return NextResponse.json({ ok: true });
}
