import OpenAI from "openai";
import { NextResponse } from "next/server";
import { TRADE_ANALYSIS_SYSTEM_PROMPT } from "@/lib/trade-analysis-prompt";
import { resolveAgentProfile, resolveModelForProfile } from "@/lib/agent-profiles";

export const runtime = "nodejs";

type TradeEv =
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

  let body: { plan?: string; stream?: boolean; agentId?: string };
  try {
    body = (await req.json()) as { plan?: string; stream?: boolean; agentId?: string };
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const plan = typeof body.plan === "string" ? body.plan.trim() : "";
  if (!plan) {
    return NextResponse.json({ error: "plan (Trade-Beschreibung) erforderlich." }, { status: 400 });
  }

  const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;
  const openai = new OpenAI({
    apiKey: key,
    baseURL: baseURL || undefined,
  });

  const profile = await resolveAgentProfile(body.agentId);
  const model = resolveModelForProfile(profile);

  const userContent = `**Geplanter Trade / Setup des Nutzers:**\n\n${plan}`;

  if (body.stream === true) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (ev: TradeEv) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(ev)}\n`));
        };
        try {
          const s = await openai.chat.completions.create(
            {
              model,
              messages: [
                { role: "system", content: TRADE_ANALYSIS_SYSTEM_PROMPT },
                { role: "user", content: userContent },
              ],
              stream: true,
              max_tokens: 2800,
              temperature: 0.4,
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
          { role: "system", content: TRADE_ANALYSIS_SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        max_tokens: 2800,
        temperature: 0.4,
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
