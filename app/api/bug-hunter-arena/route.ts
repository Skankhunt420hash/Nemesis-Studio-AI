import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  ARENA_HUNTERS,
  ARENA_SYNTHESIS_SYSTEM,
  type ArenaHunter,
} from "@/lib/bug-hunter-arena-prompts";
import { resolveAgentProfile, resolveModelForProfile } from "@/lib/agent-profiles";

export const runtime = "nodejs";

type HunterResult = {
  key: ArenaHunter["key"];
  title: string;
  content: string;
  error?: string;
};

type ArenaNdjson =
  | { type: "phase"; phase: "hunters" | "synthesis" }
  | { type: "hunter_done"; key: ArenaHunter["key"]; title: string; content: string; error?: string }
  | { type: "assistant_delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

const USER_WRAP = (target: string) =>
  `**Ziel / Kontext für die Bug-Hunter-Arena (Code, Beschreibung, API-Notizen, Screenshots in Textform …):**\n\n${target}`;

async function runOneHunter(
  openai: InstanceType<typeof OpenAI>,
  model: string,
  hunter: ArenaHunter,
  userContent: string,
  signal: AbortSignal | undefined
): Promise<HunterResult> {
  try {
    const completion = await openai.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: hunter.system },
          { role: "user", content: userContent },
        ],
        max_tokens: 1400,
        temperature: 0.35,
      },
      { signal }
    );
    const content = completion.choices[0]?.message?.content?.trim() ?? "";
    return { key: hunter.key, title: hunter.title, content: content || "(Keine Inhalte.)" };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      key: hunter.key,
      title: hunter.title,
      content: "",
      error: message,
    };
  }
}

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

  let body: { target?: string; stream?: boolean; agentId?: string };
  try {
    body = (await req.json()) as { target?: string; stream?: boolean; agentId?: string };
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const target = typeof body.target === "string" ? body.target.trim() : "";
  if (!target) {
    return NextResponse.json({ error: "target (Text/Kontext) erforderlich." }, { status: 400 });
  }

  const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;
  const openai = new OpenAI({
    apiKey: key,
    baseURL: baseURL || undefined,
  });

  const profile = await resolveAgentProfile(body.agentId);
  const model = resolveModelForProfile(profile);
  const userContent = USER_WRAP(target);

  if (body.stream === true) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (ev: ArenaNdjson) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(ev)}\n`));
        };
        try {
          send({ type: "phase", phase: "hunters" });
          const hunters = await Promise.all(
            ARENA_HUNTERS.map(async (h) => {
              const r = await runOneHunter(openai, model, h, userContent, req.signal);
              send({
                type: "hunter_done",
                key: r.key,
                title: r.title,
                content: r.content,
                error: r.error,
              });
              return r;
            })
          );

          const bundle = hunters
            .map((r) => {
              const body = r.error
                ? `*(Fehler beim Lauf: ${r.error})*`
                : r.content;
              return `### ${r.title}\n\n${body}`;
            })
            .join("\n\n---\n\n");

          send({ type: "phase", phase: "synthesis" });
          const synth = await openai.chat.completions.create(
            {
              model,
              messages: [
                { role: "system", content: ARENA_SYNTHESIS_SYSTEM },
                {
                  role: "user",
                  content: `Hier die vier Spezialisten-Reports:\n\n${bundle}\n\n---\nErzeuge jetzt den gemeinsamen **Kampfbericht** (Markdown).`,
                },
              ],
              stream: true,
              max_tokens: 2200,
              temperature: 0.45,
            },
            { signal: req.signal }
          );

          for await (const chunk of synth) {
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
    const hunters = await Promise.all(
      ARENA_HUNTERS.map((h) => runOneHunter(openai, model, h, userContent, req.signal))
    );

    const bundle = hunters
      .map((r) => {
        const body = r.error ? `*(Fehler beim Lauf: ${r.error})*` : r.content;
        return `### ${r.title}\n\n${body}`;
      })
      .join("\n\n---\n\n");

    const synthesisCompletion = await openai.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: ARENA_SYNTHESIS_SYSTEM },
          {
            role: "user",
            content: `Hier die vier Spezialisten-Reports:\n\n${bundle}\n\n---\nErzeuge jetzt den gemeinsamen **Kampfbericht** (Markdown).`,
          },
        ],
        max_tokens: 2200,
        temperature: 0.45,
      },
      { signal: req.signal }
    );

    const synthesis =
      synthesisCompletion.choices[0]?.message?.content?.trim() ?? "";

    return NextResponse.json({
      ok: true,
      model,
      agentId: profile.id,
      hunters,
      synthesis,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
