/**
 * Ollama OpenAI-Endpoint ist typisch http://host:11434/v1 — für /api/tags brauchen wir nur Origin.
 */

export function openAiBaseUrlToOllamaOrigin(openAiBase: string): string | null {
  try {
    const u = new URL(openAiBase.trim());
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export type OllamaTagsResponse = {
  models?: Array<{ name: string; model?: string }>;
};

export async function fetchOllamaModelNames(origin: string): Promise<string[]> {
  const base = origin.replace(/\/$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${base}/api/tags`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as OllamaTagsResponse;
    const names = (data.models ?? [])
      .map((m) => m.name || m.model)
      .filter((n): n is string => typeof n === "string" && n.length > 0);
    return [...new Set(names)].sort();
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}
