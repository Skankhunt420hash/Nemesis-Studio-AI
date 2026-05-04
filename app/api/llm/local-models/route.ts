import { NextResponse } from "next/server";
import { fetchOllamaModelNames, openAiBaseUrlToOllamaOrigin } from "@/lib/ollama-discovery";

export const runtime = "nodejs";

/** Liste installierter Ollama-Modelle (wenn OPENAI_BASE_URL auf Ollama zeigt). */
export async function GET() {
  const openAiBase = process.env.OPENAI_BASE_URL?.trim();
  if (!openAiBase) {
    return NextResponse.json({
      models: [] as string[],
      hint: "Setze OPENAI_BASE_URL (z. B. http://127.0.0.1:11434/v1), damit lokale Modelle erkannt werden.",
    });
  }

  const origin = openAiBaseUrlToOllamaOrigin(openAiBase);
  if (!origin) {
    return NextResponse.json({
      models: [] as string[],
      hint: "OPENAI_BASE_URL konnte nicht in eine Ollama-Adresse umgewandelt werden.",
    });
  }

  const models = await fetchOllamaModelNames(origin);
  return NextResponse.json({
    models,
    ollamaOrigin: origin,
    hint:
      models.length === 0
        ? "Keine Modelle gefunden — läuft Ollama? Dann z. B. `ollama pull llama3.2`."
        : undefined,
  });
}
