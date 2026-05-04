import type { TreeNode } from "@/components/FileTree";

/** Alle Dateipfade aus dem Explorer-Baum (sortiert). */
export function flattenTreeFiles(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  function walk(list: TreeNode[]) {
    for (const n of list) {
      if (n.type === "file") out.push(n.path);
      else if (n.children?.length) walk(n.children);
    }
  }
  walk(nodes);
  return out.sort((a, b) => a.localeCompare(b));
}

/** Alle Verzeichnis-Pfade (relativ), sortiert — ohne leeren Root. */
export function flattenTreeDirs(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  function walk(list: TreeNode[]) {
    for (const n of list) {
      if (n.type === "dir") {
        if (n.path) out.push(n.path);
        if (n.children?.length) walk(n.children);
      }
    }
  }
  walk(nodes);
  return [...new Set(out)].sort((a, b) => a.localeCompare(b));
}
