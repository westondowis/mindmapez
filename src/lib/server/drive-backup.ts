import { createServerFn } from "@tanstack/react-start";
import { parseMindBackup, type MindBackup } from "@/lib/backup";
import { authMiddleware } from "@/lib/auth/middleware";
import { ConnectorType } from "@/lib/app-data";
import { exportMind, importMind } from "@/lib/server/backup";

const FILE_NAME = "MindMesh.json";

type ToolResult = {
  ok: boolean;
  data: unknown;
  errorMessage?: string;
  loginRequired?: boolean;
  loginUrl?: string;
  pending?: boolean;
};

async function driveTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
  const { callTool } = await import("@/lib/app-data/client.server");
  return callTool(toolName, args, { connectorType: ConnectorType.GoogleDrive });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function fileIdOf(entry: Record<string, unknown>): string | null {
  const id = entry.file_id ?? entry.fileId ?? entry.id;
  return typeof id === "string" && id ? id : null;
}

function findFileId(data: unknown): string | null {
  const row = asRecord(data);
  const lists = [row?.files, row?.results, row?.items, Array.isArray(data) ? data : null];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    const exact = list.find((item) => {
      const rec = asRecord(item);
      return rec && (rec.name === FILE_NAME || rec.title === FILE_NAME);
    });
    const chosen = asRecord(exact) ?? asRecord(list[0]);
    if (chosen) return fileIdOf(chosen);
  }
  return row ? fileIdOf(row) : null;
}

function textOf(data: unknown): string | null {
  if (typeof data === "string") return data;
  const row = asRecord(data);
  if (!row) return null;
  for (const key of ["content", "text", "textContent", "body"]) {
    if (typeof row[key] === "string") return row[key];
  }
  return null;
}

function createdId(data: unknown): string | null {
  return findFileId(data);
}

async function locateFile(): Promise<{ id: string | null; blocked?: ToolResult }> {
  const tries = [
    { exact_name: FILE_NAME, max_results: 5, title_only: true },
    { q: FILE_NAME },
  ];
  let last: ToolResult | null = null;
  for (const args of tries) {
    const result = await driveTool("google_drive_search", args);
    if (result.loginRequired || result.pending) return { id: null, blocked: result };
    if (!result.ok) {
      last = result;
      continue;
    }
    return { id: findFileId(result.data) };
  }
  if (last?.loginRequired) return { id: null, blocked: last };
  return { id: null };
}

async function overwrite(id: string, json: string): Promise<ToolResult> {
  const attempts: [string, Record<string, unknown>][] = [
    ["google_drive_update_file", { file_id: id, content: json, mime_type: "application/json" }],
    ["google_drive_update_file_content", { fileId: id, textContent: json, contentMimeType: "application/json" }],
  ];
  let last: ToolResult = { ok: false, data: null, errorMessage: "Could not overwrite the Drive file." };
  for (const [name, args] of attempts) {
    const result = await driveTool(name, args);
    if (result.ok || result.loginRequired) return result;
    last = result;
    if (!/unknown|not found|unrecognized|no such tool/i.test(result.errorMessage || "")) return result;
  }
  return last;
}

async function createFile(json: string): Promise<ToolResult> {
  const attempts: [string, Record<string, unknown>][] = [
    ["google_drive_create_file", { name: FILE_NAME, content: json, mime_type: "application/json" }],
    ["google_drive_create_file", { title: FILE_NAME, textContent: json, contentMimeType: "application/json" }],
  ];
  let last: ToolResult = { ok: false, data: null, errorMessage: "Could not create the Drive file." };
  for (const [name, args] of attempts) {
    const result = await driveTool(name, args);
    if (result.ok || result.loginRequired) return result;
    last = result;
    if (!/unknown|not found|unrecognized|no such tool/i.test(result.errorMessage || "")) return result;
  }
  return last;
}

export const saveMindToDrive = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => {
    const backup = await exportMind();
    const json = JSON.stringify(backup);
    if (json.length > 900_000) {
      return { ok: false as const, error: "This mind is too large for one Drive file. Export the audio separately first." };
    }
    const located = await locateFile();
    if (located.blocked) {
      return {
        ok: false as const,
        error: located.blocked.errorMessage || "Connect Google Drive to save.",
        loginRequired: Boolean(located.blocked.loginRequired),
        loginUrl: located.blocked.loginUrl,
      };
    }
    const written = located.id ? await overwrite(located.id, json) : await createFile(json);
    if (!written.ok) {
      return {
        ok: false as const,
        error: written.errorMessage || "Google Drive did not accept the file.",
        loginRequired: Boolean(written.loginRequired),
        loginUrl: written.loginUrl,
      };
    }
    return {
      ok: true as const,
      fileId: createdId(written.data) || located.id || "",
      created: !located.id,
    };
  });

export const loadMindFromDrive = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => {
    const located = await locateFile();
    if (located.blocked) {
      return {
        ok: false as const,
        error: located.blocked.errorMessage || "Connect Google Drive to load.",
        loginRequired: Boolean(located.blocked.loginRequired),
        loginUrl: located.blocked.loginUrl,
      };
    }
    if (!located.id) return { ok: false as const, error: "No MindMesh.json file is in Google Drive yet." };
    const read = await driveTool("google_drive_read_file", { file_id: located.id, max_chars: 500000 });
    if (!read.ok) {
      return {
        ok: false as const,
        error: read.errorMessage || "Could not read MindMesh.json.",
        loginRequired: Boolean(read.loginRequired),
        loginUrl: read.loginUrl,
      };
    }
    const text = textOf(read.data);
    if (!text) return { ok: false as const, error: "MindMesh.json was empty." };
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false as const, error: "MindMesh.json is not valid JSON." };
    }
    const parsed = parseMindBackup(raw as MindBackup);
    if (!parsed.ok) return { ok: false as const, error: parsed.error };
    const restored = await importMind({ data: { backup: parsed.backup } });
    if (!restored.ok) return { ok: false as const, error: restored.error };
    return { ok: true as const, summary: restored.summary };
  });
