import { ensureWorkspaceExists } from "@/lib/workspace";
import { getSession, subscribeSession } from "@/lib/terminal-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureWorkspaceExists();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return new Response("Query ?id= fehlt.", { status: 400 });
  }
  if (!getSession(id)) {
    return new Response("Unbekannte oder beendete Session.", { status: 404 });
  }

  const enc = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (obj: object) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      send({ t: "ready" });

      const unsub = subscribeSession(id, (chunk: string) => {
        const d = Buffer.from(chunk, "utf8").toString("base64");
        send({ t: "o", d });
      });
      if (!unsub) {
        controller.close();
        return;
      }
      unsubscribe = unsub;

      const onAbort = () => {
        try {
          unsubscribe?.();
        } catch {
          /* ignore */
        }
        unsubscribe = null;
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };
      req.signal.addEventListener("abort", onAbort);
    },
    cancel() {
      try {
        unsubscribe?.();
      } catch {
        /* ignore */
      }
      unsubscribe = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Connection: "keep-alive",
    },
  });
}
