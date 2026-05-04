import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { ensureWorkspaceExists, getWorkspaceRoot } from "@/lib/workspace";

export const runtime = "nodejs";

type TreeNode = { name: string; path: string; type: "file" | "dir"; children?: TreeNode[] };

async function buildTree(dir: string, relBase: string): Promise<TreeNode[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: TreeNode[] = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = relBase ? `${relBase}/${e.name}` : e.name;
    if (e.isDirectory()) {
      const children = await buildTree(path.join(dir, e.name), rel);
      nodes.push({ name: e.name, path: rel, type: "dir", children });
    } else {
      nodes.push({ name: e.name, path: rel, type: "file" });
    }
  }
  return nodes;
}

export async function GET() {
  await ensureWorkspaceExists();
  const root = getWorkspaceRoot();
  const children = await buildTree(root, "");
  return NextResponse.json({ root: "agent-workspace", tree: children });
}
