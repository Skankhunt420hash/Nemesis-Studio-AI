import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

const SOCRATIC_DIFF_SYSTEM = `
### Modus: Verhör zum Diff
Der Nutzer hat ggf. zwei Textstände oder einen Diff mitgeschickt. Erkläre **nicht** sofort alles: führe ein **kurzes Verhör** — maximal **zwei präzise Rückfragen** pro Antwort, damit der Nutzer selbst denkt. Erst nach klaren Antworten des Nutzers: knapp zusammenfassen, was der Diff bedeutet.`;

export function applySocraticDiffToSystem(systemContent: string, enabled: boolean): string {
  if (!enabled) return systemContent;
  return `${systemContent}\n${SOCRATIC_DIFF_SYSTEM}`;
}

export function mergeScratchSnippetsIntoLastUserMessage(
  messages: ChatCompletionMessageParam[],
  snippets: string[]
): ChatCompletionMessageParam[] {
  if (!snippets.length) return messages;
  const block = snippets
    .map((s, i) => `### Scratch-Pad ${i + 1}\n${s.trim()}`)
    .join("\n\n");
  return injectTextBlockIntoLastUserMessage(messages, `---\n${block}`);
}

export type ChatImagePart = { mime: string; base64: string };

export function mergeImagesIntoLastUserMessage(
  messages: ChatCompletionMessageParam[],
  images: ChatImagePart[]
): ChatCompletionMessageParam[] {
  if (!images.length) return messages;
  const out: ChatCompletionMessageParam[] = messages.map((m) => ({ ...m }));
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i];
    if (m.role !== "user") continue;
    const parts: ChatCompletionContentPart[] = [];
    if (typeof m.content === "string") {
      parts.push({ type: "text", text: m.content });
    } else if (Array.isArray(m.content)) {
      parts.push(...m.content);
    }
    for (const img of images) {
      const mime = img.mime || "image/png";
      parts.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${img.base64}` },
      });
    }
    out[i] = { role: "user", content: parts };
    return out;
  }
  out.push({
    role: "user",
    content: [
      { type: "text", text: "(Bildanhang vom Nutzer)" },
      ...images.map(
        (img): ChatCompletionContentPart => ({
          type: "image_url",
          image_url: {
            url: `data:${img.mime || "image/png"};base64,${img.base64}`,
          },
        })
      ),
    ],
  });
  return out;
}

function injectTextBlockIntoLastUserMessage(
  messages: ChatCompletionMessageParam[],
  block: string
): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = messages.map((m) => ({ ...m }));
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") {
      out[i] = { role: "user", content: `${m.content}\n\n${block}` };
      return out;
    }
    if (Array.isArray(m.content)) {
      out[i] = {
        role: "user",
        content: [...m.content, { type: "text" as const, text: `\n\n${block}` }],
      };
      return out;
    }
  }
  out.push({ role: "user", content: block });
  return out;
}
