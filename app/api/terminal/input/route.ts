import { NextResponse } from "next/server";
import { writeSession } from "@/lib/terminal-sessions";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { id?: string; data?: string };
  try {
    body = (await req.json()) as { id?: string; data?: string };
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }
  if (!body.id || typeof body.data !== "string") {
    return NextResponse.json({ error: "id und data (string) erforderlich." }, { status: 400 });
  }
  const ok = writeSession(body.id, body.data);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "Session unbekannt oder beendet." }, { status: 410 });
  }
  return NextResponse.json({ ok: true });
}
