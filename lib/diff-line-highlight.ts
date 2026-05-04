/** Grobe Zeilen-Markierung für „Ghost“-Hervorhebung (1-basierte Zeilennummern). */
export function computeChangedLineNumbers(before: string, after: string): number[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const max = Math.max(a.length, b.length);
  const lines: number[] = [];
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) lines.push(i + 1);
  }
  return lines;
}
