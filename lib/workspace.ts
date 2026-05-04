import path from "path";
import fs from "fs/promises";

export function getWorkspaceRoot(): string {
  return path.resolve(process.cwd(), "agent-workspace");
}

/** Relativer Pfad zum Workspace; wirft bei Path-Traversal. */
export function resolveWorkspacePath(rel: string): string {
  const root = getWorkspaceRoot();
  const normalized = rel.replace(/^[/\\]+/, "").replace(/\//g, path.sep);
  const full = path.resolve(path.join(root, normalized));
  const relative = path.relative(root, full);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Pfad liegt außerhalb des Agent-Workspace.");
  }
  return full;
}

export async function ensureWorkspaceExists(): Promise<void> {
  await fs.mkdir(getWorkspaceRoot(), { recursive: true });
}
