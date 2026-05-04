/** Kompakter Text für „Diff als Verhör“ (Nutzer-Nachricht / Anhang). */
export function formatDiffForVerhoer(
  path: string,
  original: string,
  modified: string,
  maxPairs = 36
): string {
  const a = original.split("\n");
  const b = modified.split("\n");
  const max = Math.max(a.length, b.length);
  const lines: string[] = [
    `Datei: ${path}`,
    "Bitte den folgenden Diff im **Verhör-Modus** erklären (kurze Rückfragen, dann erst Zusammenfassung).",
    "",
    "Geänderte Zeilen (Auszug):",
    "",
  ];
  let pairs = 0;
  for (let i = 0; i < max && pairs < maxPairs; i++) {
    if (a[i] === b[i]) continue;
    pairs += 1;
    lines.push(`Zeile ${i + 1} alt: ${JSON.stringify(a[i] ?? "")}`);
    lines.push(`Zeile ${i + 1} neu: ${JSON.stringify(b[i] ?? "")}`);
    lines.push("");
  }
  if (pairs >= maxPairs && a.slice(pairs).join("\n") !== b.slice(pairs).join("\n")) {
    lines.push("… (weitere Zeilen unterschiedlich, gekürzt)");
  }
  return lines.join("\n").slice(0, 14_000);
}
