import fs from "node:fs/promises";
import path from "node:path";
import { resolveWorkspacePath } from "@/lib/workspace";

export type ContextAttachment = { path: string; kind: "file" | "dir" };

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "__pycache__",
  ".venv",
  "venv",
  ".nemesis-drops",
]);

const MAX_FILE_CHARS = 200_000;
const MAX_DIR_LIST = 120;
const MAX_DIR_FILE_SNIPPETS = 25;
const MAX_SNIPPET_CHARS = 12_000;

async function readTextFilePreview(abs: string, max: number): Promise<string> {
  const buf = await fs.readFile(abs);
  const text = buf.toString("utf8");
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n… (gekürzt, ${text.length} Zeichen gesamt)`;
}

async function readFileHead(abs: string, maxBytes: number): Promise<Buffer> {
  const fh = await fs.open(abs, "r");
  try {
    const size = Number((await fh.stat()).size);
    const n = Math.min(maxBytes, Number.isFinite(size) ? size : maxBytes);
    const buf = Buffer.allocUnsafe(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

function bufferLooksBinary(buf: Buffer): boolean {
  if (buf.length === 0) return false;
  let nul = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0) nul++;
  }
  if (nul > 0) return true;
  return false;
}

async function shouldTreatAsBinary(abs: string, rel: string): Promise<boolean> {
  if (hasBinaryExtension(rel)) return true;
  if (looksTextual(path.basename(rel))) return false;
  try {
    const head = await readFileHead(abs, 12_288);
    return bufferLooksBinary(head);
  } catch {
    return true;
  }
}

async function walkDirFiles(absDir: string, relDir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(abs: string, rel: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (IGNORE_DIRS.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      const next = path.join(abs, e.name);
      if (e.isDirectory()) await walk(next, r);
      else if (e.isFile()) out.push(r.split(path.sep).join("/"));
    }
  }
  await walk(absDir, relDir);
  return out.sort((a, b) => a.localeCompare(b));
}

/** Bekannte Binär-/Medien-Endungen — nicht als UTF-8 einlesen. */
function hasBinaryExtension(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".bmp",
    ".tif",
    ".tiff",
    ".heic",
    ".avif",
    ".mp3",
    ".wav",
    ".ogg",
    ".flac",
    ".m4a",
    ".aac",
    ".opus",
    ".wma",
    ".mp4",
    ".webm",
    ".mov",
    ".mkv",
    ".avi",
    ".wmv",
    ".m4v",
    ".mpeg",
    ".mpg",
    ".3gp",
    ".pdf",
    ".zip",
    ".gz",
    ".tgz",
    ".rar",
    ".7z",
    ".bz2",
    ".xz",
    ".wasm",
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".bin",
    ".dat",
    ".sqlite",
    ".db",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".eot",
  ]).has(ext);
}

function looksTextual(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".md",
    ".mdx",
    ".css",
    ".scss",
    ".html",
    ".htm",
    ".xml",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".txt",
    ".env",
    ".sh",
    ".ps1",
    ".py",
    ".rs",
    ".go",
    ".java",
    ".sql",
    ".svg",
  ]).has(ext);
}

/**
 * Baut einen Textblock für den Agenten aus Datei- und Ordner-Anhängen (nur Workspace).
 */
export async function buildContextAttachmentBlock(
  items: ContextAttachment[]
): Promise<string> {
  if (!items.length) return "";

  const blocks: string[] = [];
  blocks.push(
    "Die folgenden Abschnitte wurden vom Nutzer als Kontext angehängt (Pfade relativ zu agent-workspace)."
  );

  for (const item of items) {
    const rel = item.path.replace(/^[/\\]+/, "").replace(/\\/g, "/");
    let abs: string;
    try {
      abs = resolveWorkspacePath(rel);
    } catch (e) {
      blocks.push(`\n### ${rel}\n_(ungültiger Pfad: ${e instanceof Error ? e.message : String(e)})_`);
      continue;
    }

    let st;
    try {
      st = await fs.stat(abs);
    } catch {
      blocks.push(`\n### ${rel}\n_(nicht gefunden)_`);
      continue;
    }

    if (item.kind === "file") {
      if (!st.isFile()) {
        blocks.push(`\n### Datei: ${rel}\n_(ist kein File — evtl. Ordner?)_`);
        continue;
      }
      const binary = await shouldTreatAsBinary(abs, rel);
      if (binary) {
        blocks.push(
          `\n### Datei: ${rel}\n` +
            `_(Binär- oder Mediendatei, ${st.size} Bytes. Liegt im Workspace — mit passenden Terminal-Befehlen, Skripten oder MCP-Tools bearbeiten; \`read_file\` liefert hier keinen sinnvollen Klartext.)_`
        );
        continue;
      }
      const body = await readTextFilePreview(abs, MAX_FILE_CHARS);
      blocks.push(`\n### Datei: ${rel}\n\`\`\`\n${body}\n\`\`\``);
      continue;
    }

    if (item.kind === "dir") {
      if (!st.isDirectory()) {
        blocks.push(`\n### Ordner: ${rel}\n_(ist kein Verzeichnis)_`);
        continue;
      }
      const files = await walkDirFiles(abs, rel);
      const listed = files.slice(0, MAX_DIR_LIST);
      const lines = [
        `\n### Ordner: ${rel}`,
        `Dateien (${files.length}, Anzeige max. ${MAX_DIR_LIST}):`,
        ...listed.map((f) => `- ${f}`),
      ];
      if (files.length > MAX_DIR_LIST) {
        lines.push(`… und ${files.length - MAX_DIR_LIST} weitere.`);
      }

      const snippets: string[] = [];
      let budget = MAX_DIR_FILE_SNIPPETS * MAX_SNIPPET_CHARS;
      let count = 0;
      for (const f of files) {
        if (count >= MAX_DIR_FILE_SNIPPETS || budget <= 0) break;
        if (!looksTextual(f)) continue;
        let full: string;
        try {
          full = await readTextFilePreview(resolveWorkspacePath(f), MAX_SNIPPET_CHARS);
        } catch {
          continue;
        }
        snippets.push(`\n#### ${f}\n\`\`\`\n${full}\n\`\`\``);
        budget -= full.length;
        count += 1;
      }
      if (snippets.length) {
        lines.push("", "Auszüge aus Textdateien im Ordner:", ...snippets);
      } else {
        lines.push("", "_(Keine passenden Textdateien für automatische Auszüge.)_");
      }
      blocks.push(lines.join("\n"));
    }
  }

  return blocks.join("\n");
}
