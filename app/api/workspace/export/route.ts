import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { ensureWorkspaceExists, getWorkspaceRoot } from "@/lib/workspace";

export const runtime = "nodejs";

type ExportEntry = {
  path: string;
  kind: "file" | "skipped";
  reason?: string;
  content?: string;
  size?: number;
};

const MAX_FILE_BYTES = 1024 * 1024;
const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".txt",
  ".yml",
  ".yaml",
  ".css",
  ".html",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".xml",
  ".env",
  ".sh",
  ".sql",
]);

function relPosix(root: string, full: string): string {
  return path.relative(root, full).replace(/\\/g, "/");
}

async function walk(root: string, dir: string, out: ExportEntry[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(root, full, out);
      continue;
    }
    if (!e.isFile()) continue;
    const rel = relPosix(root, full);
    const st = await fs.stat(full);
    if (st.size > MAX_FILE_BYTES) {
      out.push({
        path: rel,
        kind: "skipped",
        reason: `Datei > ${MAX_FILE_BYTES} Bytes`,
        size: st.size,
      });
      continue;
    }
    const ext = path.extname(rel).toLowerCase();
    if (!TEXT_EXT.has(ext) && !rel.endsWith(".env.example")) {
      out.push({
        path: rel,
        kind: "skipped",
        reason: "Dateityp nicht als Text markiert",
        size: st.size,
      });
      continue;
    }
    const content = await fs.readFile(full, "utf-8");
    out.push({
      path: rel,
      kind: "file",
      size: st.size,
      content,
    });
  }
}

export async function GET() {
  try {
    await ensureWorkspaceExists();
    const root = getWorkspaceRoot();
    const out: ExportEntry[] = [];
    await walk(root, root, out);
    return NextResponse.json({
      ok: true,
      exportedAt: new Date().toISOString(),
      root: "agent-workspace",
      count: out.length,
      entries: out,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
