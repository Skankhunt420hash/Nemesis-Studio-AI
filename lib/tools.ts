import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import picomatch from "picomatch";
import { recordPathBeforeMutation } from "./agent-mutation-batch";
import {
  computeRiskSizingJson,
  fetchCoingeckoSimplePrices,
  sanitizeCoingeckoIds,
  sanitizeVsCurrencies,
} from "./genius-crypto";
import { ensureWorkspaceExists, getWorkspaceRoot, resolveWorkspacePath } from "./workspace";

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

async function listWorkspaceFiles(): Promise<string[]> {
  await ensureWorkspaceExists();
  const root = getWorkspaceRoot();
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
      else out.push(r.split(path.sep).join("/"));
    }
  }

  await walk(root, "");
  return out.sort();
}

export const BUILTIN_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "list_directory",
      description:
        "Listet Dateien und Ordner im angegebenen Verzeichnis (relativ zum Workspace). Leerer Pfad = Workspace-Root.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relativer Ordnerpfad, z.B. '' oder 'src'" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Liest eine Textdatei im Workspace (UTF-8).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relativer Dateipfad" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "write_file",
      description:
        "Schreibt oder überschreibt eine Datei im Workspace. Erstellt fehlende Ordner.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relativer Dateipfad" },
          content: { type: "string", description: "Vollständiger Dateiinhalt" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "str_replace",
      description:
        "Ersetzt in einer Datei exakt ein Vorkommen von old_string durch new_string (sicherer als ganze Datei neu schreiben). optional replace_all.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_string: { type: "string" },
          new_string: { type: "string" },
          replace_all: { type: "boolean", description: "Alle Vorkommen ersetzen" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_file",
      description: "Löscht eine Datei im Workspace (keine Ordner).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relativer Dateipfad" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "glob_file_search",
      description: "Sucht Dateipfade per Glob (picomatch), z.B. **/*.ts, **/*.{md,json}",
      parameters: {
        type: "object",
        properties: {
          glob_pattern: { type: "string" },
          max_results: { type: "integer", description: "Standard 120, max 250" },
        },
        required: ["glob_pattern"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "grep",
      description:
        "Sucht eine Zeichenkette in Dateien (literal). Optional glob-Filter und case_insensitive.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          glob: { type: "string", description: "z.B. **/*.ts, Standard **/*" },
          case_insensitive: { type: "boolean" },
          max_results: { type: "integer", description: "Standard 50, max 120" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "run_terminal_cmd",
      description:
        "Führt einen Shell-Befehl im Workspace-Root aus (nur wenn vom Server aktiviert). Timeout max 120s. Vorsicht bei destruktiven Befehlen.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Ein Befehl (Windows: cmd, Unix: sh -c)" },
          timeout_sec: { type: "integer", description: "Optional, 10–120" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "crypto_public_prices",
      description:
        "Öffentliche Spot-Referenzpreise (CoinGecko, read-only). Für Bot-UI, Alerts, Dashboards. Keine Orders. Nur vordefinierte coin_ids erlaubt.",
      parameters: {
        type: "object",
        properties: {
          coin_ids: {
            type: "array",
            items: { type: "string" },
            description: "z.B. [\"bitcoin\",\"ethereum\"] — nur erlaubte IDs",
          },
          vs_currencies: {
            type: "array",
            items: { type: "string" },
            description: "Optional, z.B. [\"usd\",\"eur\"]",
          },
        },
        required: ["coin_ids"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "crypto_risk_sizing",
      description:
        "Reine Rechenhilfe: maximales Order-Notional grob aus Equity, Risiko-% pro Trade und Stop-Abstand in %. Kein Handel, keine Beratung.",
      parameters: {
        type: "object",
        properties: {
          equity_usd: { type: "number", description: "Kapital in USD" },
          risk_percent: {
            type: "number",
            description: "Verlustbudget pro Trade am Kapital, z.B. 1 für 1 %",
          },
          stop_move_percent: {
            type: "number",
            description: "Stop-Abstand grob in % vom Einstieg (Preisbewegung bis Stop)",
          },
        },
        required: ["equity_usd", "risk_percent", "stop_move_percent"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "genius_format_currency",
      description:
        "Formatiert Beträge für ansprechende Bot-Texte (Intl, de-DE oder en-US). Keine Marktdaten.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number" },
          currency: {
            type: "string",
            description: "ISO z.B. USD, EUR — Standard USD",
          },
          locale: {
            type: "string",
            description: "Optional: de-DE oder en-US",
          },
        },
        required: ["amount"],
      },
    },
  },
];

function runShell(command: string, cwd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const shell = isWin ? "cmd.exe" : "/bin/sh";
    const shellArgs = isWin ? ["/d", "/s", "/c", command] : ["-c", command];
    const child = spawn(shell, shellArgs, {
      cwd,
      windowsHide: true,
      env: { ...process.env, CI: "1" },
    });
    let out = "";
    let err = "";
    const cap = 200_000;
    const kill = (reason: string) => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      resolve(`${out}${err}\n[Abbruch: ${reason}]`.slice(0, cap));
    };
    const timer = setTimeout(() => kill("Timeout"), timeoutMs);
    child.stdout?.on("data", (d: Buffer) => {
      out += d.toString();
      if (out.length + err.length > cap) kill("Ausgabe zu groß");
    });
    child.stderr?.on("data", (d: Buffer) => {
      err += d.toString();
      if (out.length + err.length > cap) kill("Ausgabe zu groß");
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const tail = `---\nexit ${code}`;
      resolve(`${out}${err}\n${tail}`.slice(0, cap));
    });
  });
}

export async function executeBuiltinTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  await ensureWorkspaceExists();

  try {
    switch (name) {
      case "list_directory": {
        const rel = typeof args.path === "string" ? args.path : "";
        const dir =
          rel.trim() === "" ? getWorkspaceRoot() : resolveWorkspacePath(rel);
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const lines = entries
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`);
        return lines.length ? lines.join("\n") : "(leer)";
      }
      case "read_file": {
        const p = typeof args.path === "string" ? args.path : "";
        if (!p) return "Fehler: path fehlt";
        const full = resolveWorkspacePath(p);
        const content = await fs.readFile(full, "utf-8");
        return content;
      }
      case "write_file": {
        const p = typeof args.path === "string" ? args.path : "";
        const content = typeof args.content === "string" ? args.content : "";
        if (!p) return "Fehler: path fehlt";
        await recordPathBeforeMutation(p);
        const full = resolveWorkspacePath(p);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, content, "utf-8");
        return `OK: geschrieben → ${p}`;
      }
      case "str_replace": {
        const p = typeof args.path === "string" ? args.path : "";
        const oldS = typeof args.old_string === "string" ? args.old_string : "";
        const newS = typeof args.new_string === "string" ? args.new_string : "";
        const replaceAll = args.replace_all === true;
        if (!p || !oldS) return "Fehler: path oder old_string fehlt";
        await recordPathBeforeMutation(p);
        const full = resolveWorkspacePath(p);
        const raw = await fs.readFile(full, "utf-8");
        if (replaceAll) {
          if (!raw.includes(oldS)) return "Fehler: old_string nicht gefunden";
          const next = raw.split(oldS).join(newS);
          await fs.writeFile(full, next, "utf-8");
          return `OK: ${raw.split(oldS).length - 1} Ersetzung(en) in ${p}`;
        }
        const first = raw.indexOf(oldS);
        if (first === -1) return "Fehler: old_string nicht gefunden";
        const second = raw.indexOf(oldS, first + oldS.length);
        if (second !== -1) return "Fehler: old_string mehrdeutig (mehrfach)";
        const next = raw.slice(0, first) + newS + raw.slice(first + oldS.length);
        await fs.writeFile(full, next, "utf-8");
        return `OK: eine Ersetzung in ${p}`;
      }
      case "delete_file": {
        const p = typeof args.path === "string" ? args.path : "";
        if (!p) return "Fehler: path fehlt";
        await recordPathBeforeMutation(p);
        const full = resolveWorkspacePath(p);
        await fs.unlink(full);
        return `OK: gelöscht → ${p}`;
      }
      case "glob_file_search": {
        const pattern =
          typeof args.glob_pattern === "string" ? args.glob_pattern : "**/*";
        const max = Math.min(Math.max(Number(args.max_results) || 120, 1), 250);
        const isMatch = picomatch(pattern, { dot: true });
        const hits = (await listWorkspaceFiles())
          .filter((f) => isMatch(f))
          .slice(0, max);
        return hits.length ? hits.join("\n") : "Keine Treffer";
      }
      case "grep": {
        const query = typeof args.query === "string" ? args.query : "";
        const globPat = typeof args.glob === "string" && args.glob ? args.glob : "**/*";
        const ic = args.case_insensitive === true;
        const max = Math.min(Math.max(Number(args.max_results) || 50, 1), 120);
        if (!query) return "Fehler: query fehlt";
        const isMatch = picomatch(globPat, { dot: true });
        const files = (await listWorkspaceFiles()).filter((f) => isMatch(f));
        const needle = ic ? query.toLowerCase() : query;
        const linesOut: string[] = [];
        for (const rel of files) {
          if (linesOut.length >= max) break;
          const full = resolveWorkspacePath(rel);
          let st;
          try {
            st = await fs.stat(full);
          } catch {
            continue;
          }
          if (st.size > 900_000) continue;
          let content: string;
          try {
            content = await fs.readFile(full, "utf-8");
          } catch {
            continue;
          }
          const haystack = ic ? content.toLowerCase() : content;
          const searchNeedle = ic ? needle : query;
          let start = 0;
          while (linesOut.length < max) {
            const idx = haystack.indexOf(searchNeedle, start);
            if (idx === -1) break;
            const lineNum = content.slice(0, idx).split("\n").length;
            const lineStart = content.lastIndexOf("\n", Math.max(0, idx - 1)) + 1;
            const lineEnd = content.indexOf("\n", idx);
            const lineRaw = content.slice(
              lineStart,
              lineEnd === -1 ? undefined : lineEnd
            );
            linesOut.push(`${rel}:${lineNum}:${lineRaw.slice(0, 240)}`);
            start = idx + Math.max(searchNeedle.length, 1);
          }
        }
        return linesOut.length ? linesOut.join("\n") : "Keine Treffer";
      }
      case "run_terminal_cmd": {
        if (process.env.AGENT_ENABLE_TERMINAL !== "1") {
          return "Terminal ist deaktiviert. Setze AGENT_ENABLE_TERMINAL=1 in .env.local (Sicherheitsrisiko).";
        }
        const cmd = typeof args.command === "string" ? args.command.trim() : "";
        if (!cmd) return "Fehler: command fehlt";
        const t = Number(args.timeout_sec);
        const timeoutMs = Math.min(
          120_000,
          Math.max(10_000, Number.isFinite(t) ? t * 1000 : 60_000)
        );
        const cwd = getWorkspaceRoot();
        return await runShell(cmd, cwd, timeoutMs);
      }
      case "crypto_public_prices": {
        const ids = sanitizeCoingeckoIds(args.coin_ids);
        const vs = sanitizeVsCurrencies(args.vs_currencies);
        return await fetchCoingeckoSimplePrices(ids, vs);
      }
      case "crypto_risk_sizing": {
        const eq = Number(args.equity_usd);
        const rp = Number(args.risk_percent);
        const sp = Number(args.stop_move_percent);
        return computeRiskSizingJson(eq, rp, sp);
      }
      case "genius_format_currency": {
        const amount = Number(args.amount);
        const cur =
          typeof args.currency === "string" && args.currency.trim()
            ? args.currency.trim().toUpperCase()
            : "USD";
        const locRaw = typeof args.locale === "string" ? args.locale.trim() : "";
        const loc =
          locRaw === "de-DE" || locRaw === "en-US"
            ? locRaw
            : cur === "EUR"
              ? "de-DE"
              : "en-US";
        if (!Number.isFinite(amount)) return "Fehler: amount muss eine Zahl sein";
        try {
          return new Intl.NumberFormat(loc, {
            style: "currency",
            currency: cur.length === 3 ? cur : "USD",
            maximumFractionDigits: 8,
          }).format(amount);
        } catch {
          return `Fehler: ungültige Währung „${cur}“`;
        }
      }
      default:
        return `Unbekanntes Tool: ${name}`;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `Fehler: ${msg}`;
  }
}
