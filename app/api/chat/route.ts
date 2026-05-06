import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { NextResponse } from "next/server";
import type { AgentStreamEvent } from "@/lib/agent-types";
import { runAgent } from "@/lib/agent";
import { streamAgent } from "@/lib/agent-stream";
import {
  buildContextAttachmentBlock,
  type ContextAttachment,
} from "@/lib/agent-context-pack";
import {
  resolveAgentProfile,
  resolveMaxToolRounds,
  resolveModelForProfile,
} from "@/lib/agent-profiles";
import {
  applySocraticDiffToSystem,
  mergeImagesIntoLastUserMessage,
  mergeScratchSnippetsIntoLastUserMessage,
  type ChatImagePart,
} from "@/lib/chat-enrichment";
import {
  appendSoulMemoryToSystem,
  normalizeSoulMemoryFromClient,
} from "@/lib/soul-memory-prompt";
import { ensureWorkspaceExists } from "@/lib/workspace";
import { getAllToolDefinitions } from "@/lib/tools-registry";

export const runtime = "nodejs";

function injectContextBlockIntoLastUserMessage(
  messages: ChatCompletionMessageParam[],
  block: string
): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = messages.map((m) => ({ ...m }));
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") {
      out[i] = { role: "user", content: `${m.content}\n\n---\n\n${block}` };
      return out;
    }
    if (Array.isArray(m.content)) {
      out[i] = {
        role: "user",
        content: [
          ...m.content,
          { type: "text" as const, text: `\n\n---\n\n${block}` },
        ],
      };
      return out;
    }
  }
  out.push({ role: "user", content: block });
  return out;
}

const SYSTEM_PROMPT_BASE = `Du bist ein Coding-Agent (Composer-ähnlich). Du arbeitest ausschließlich im Ordner agent-workspace — nutze relative Pfade für die eingebauten Datei-Tools.

Eingebaute Werkzeuge:
- list_directory, read_file, write_file, str_replace, delete_file
- glob_file_search, grep, run_terminal_cmd (nur wenn aktiviert)
- crypto_public_prices (öffentliche Referenzkurse, read-only), crypto_risk_sizing (Rechenhilfe), genius_format_currency (Anzeige-Format)

Zusätzliche Werkzeuge können über MCP kommen — Namen mit Präfix mcp__.

Bevorzuge str_replace für kleine Änderungen. Antworte auf Deutsch, wenn der Nutzer Deutsch schreibt.
Bei Tool-Fehlern: Meldung lesen, Strategie anpassen, nicht stumpf wiederholen.

Der Nutzer kann ganze Dateien oder Ordner als Kontext anhängen — Abschnitte mit „### Datei:“ / „### Ordner:“ unter der Nachricht beachten.

Für eine strukturierte **Trade-Dry-Run-Analyse** (Trade im Kopf durchspielen, Risiko/Logik — keine Anlageberatung) kann der Nutzer im UI das Panel **Trade-Check** nutzen (\`/api/trade-analysis\`).

Wenn **Soul Memory** im System-Prompt steht, nutze es als weichen Leitfaden für Ton, Vorschläge und Vermeidung wiederholter Fehler — ohne die aktuelle Nutzeranweisung zu überstimmen.`;

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

  let body: {
    messages?: ChatCompletionMessageParam[];
    stream?: boolean;
    agentId?: string;
    contextAttachments?: ContextAttachment[];
    socraticDiff?: boolean;
    scratchSnippets?: string[];
    images?: Array<{ mime?: string; base64: string }>;
    soulMemory?: unknown;
  };
  try {
    body = (await req.json()) as {
      messages?: ChatCompletionMessageParam[];
      stream?: boolean;
      agentId?: string;
      contextAttachments?: ContextAttachment[];
      socraticDiff?: boolean;
      scratchSnippets?: string[];
      images?: Array<{ mime?: string; base64: string }>;
      soulMemory?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const incomingRaw = body.messages;
  if (!Array.isArray(incomingRaw) || incomingRaw.length === 0) {
    return NextResponse.json({ error: "messages[] erforderlich." }, { status: 400 });
  }

  await ensureWorkspaceExists();

  const rawAtt = body.contextAttachments;
  const attachments: ContextAttachment[] = Array.isArray(rawAtt)
    ? rawAtt
        .filter(
          (x): x is ContextAttachment =>
            x != null &&
            typeof x === "object" &&
            typeof (x as ContextAttachment).path === "string" &&
            ((x as ContextAttachment).kind === "file" ||
              (x as ContextAttachment).kind === "dir")
        )
        .map((x) => ({
          path: String(x.path).replace(/^[/\\]+/, "").replace(/\\/g, "/"),
          kind: x.kind,
        }))
    : [];

  let incoming = incomingRaw;
  if (attachments.length > 0) {
    const block = await buildContextAttachmentBlock(attachments);
    if (block.trim()) {
      incoming = injectContextBlockIntoLastUserMessage(incomingRaw, block);
    }
  }

  const rawSnippets = body.scratchSnippets;
  const snippets: string[] = Array.isArray(rawSnippets)
    ? rawSnippets
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
  if (snippets.length) {
    incoming = mergeScratchSnippetsIntoLastUserMessage(incoming, snippets);
  }

  const rawImgs = body.images;
  const imgs: ChatImagePart[] = [];
  if (Array.isArray(rawImgs)) {
    const MAX_B64 = 1_800_000;
    for (const x of rawImgs.slice(0, 6)) {
      if (!x || typeof x !== "object") continue;
      const base64 = typeof (x as { base64?: unknown }).base64 === "string" ? (x as { base64: string }).base64 : "";
      if (!base64 || base64.length > MAX_B64) continue;
      const mime =
        typeof (x as { mime?: unknown }).mime === "string" && (x as { mime: string }).mime.trim()
          ? (x as { mime: string }).mime.trim()
          : "image/png";
      imgs.push({ mime, base64 });
    }
  }
  if (imgs.length) {
    incoming = mergeImagesIntoLastUserMessage(incoming, imgs);
  }

  const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;
  const openai = new OpenAI({
    apiKey: key,
    baseURL: baseURL || undefined,
  });

  const profile = await resolveAgentProfile(body.agentId);
  const model = resolveModelForProfile(profile);
  const maxToolRounds = resolveMaxToolRounds(profile);
  const tools = await getAllToolDefinitions();

  const soulParsed = normalizeSoulMemoryFromClient(body.soulMemory);
  const socratic = body.socraticDiff === true;
  const coreSystem = appendSoulMemoryToSystem(
    `${SYSTEM_PROMPT_BASE}

## Aktiver Agent: ${profile.label}
${profile.systemExtension}`,
    soulParsed
  );
  const systemContent = applySocraticDiffToSystem(coreSystem, socratic);

  const system: ChatCompletionMessageParam = {
    role: "system",
    content: systemContent,
  };

  const payload = [system, ...incoming];

  if (body.stream === true) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (ev: AgentStreamEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(ev)}\n`));
        };
        try {
          for await (const ev of streamAgent(openai, payload, model, {
            tools,
            signal: req.signal,
            maxToolRounds,
          })) {
            send(ev);
          }
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

  const result = await runAgent(openai, payload, model, {
    tools,
    signal: req.signal,
    maxToolRounds,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    trace: result.trace,
    finalMessage: result.finalMessage,
    agentId: profile.id,
    model,
    undoSnapshots: result.undoSnapshots,
  });
}
