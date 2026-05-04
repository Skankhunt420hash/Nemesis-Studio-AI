import OpenAI from "openai";
import { NextResponse } from "next/server";
import { COUNCIL_SYSTEM_PROMPT } from "@/lib/council-prompt";
import { resolveAgentProfile, resolveModelForProfile } from "@/lib/agent-profiles";

export const runtime = "nodejs";

type CouncilEvent =
  | { type: "assistant_delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY fehlt. In .env.local z. B. bei Ollama: OPENAI_API_KEY=ollama",
      },
      { status: 500 }
    );
  }

  let body: { idea?: string; stream?: boolean; agentId?: string };
  try {
    body = (await req.json()) as { idea?: string; stream?: boolean; agentId?: string };
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const idea = typeof body.idea === "string" ? body.idea.trim() : "";
  if (!idea) {
    return NextResponse.json({ error: "idea (Text) erforderlich." }, { status: 400 });
  }

  const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;
  const openai = new OpenAI({
    apiKey: key,
    baseURL: baseURL || undefined,
  });

  const profile = await resolveAgentProfile(body.agentId);
  const model = resolveModelForProfile(profile);

  const userContent = `**Vorhaben / Idee des Nutzers:**\n\n${idea}`;

  if (body.stream === true) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (ev: CouncilEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(ev)}\n`));
        };
        try {
          const s = await openai.chat.completions.create(
            {
              model,
              messages: [
                { role: "system", content: COUNCIL_SYSTEM_PROMPT },
                { role: "user", content: userContent },
              ],
              stream: true,
            },
            { signal: req.signal }
          );
          for await (const chunk of s) {
            const d = chunk.choices[0]?.delta?.content;
            if (d) send({ type: "assistant_delta", text: d });
          }
          send({ type: "done" });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          send({ type: "error", message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const completion = await openai.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: COUNCIL_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      },
      { signal: req.signal }
    );
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    return NextResponse.json({ ok: true, text, model, agentId: profile.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
