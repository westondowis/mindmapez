import { isViewerType, validateViewerFields, type JsonObject, type ViewerType } from "./digestion/viewer-types.ts";

export const BACKUP_FORMAT = "mindmesh-backup";
/** v2 (v5.35) adds viewer columns on memories and digested datasets; v1 files still restore. */
export const BACKUP_VERSION = 2;

export type BackupSettings = {
  displayName: string;
  age: number | null;
  onboarded: boolean;
  plan: "free" | "pro";
  brainSectorsJson: string | null;
};

export type BackupConcept = {
  id: string;
  name: string;
  kind: string;
  icon: string | null;
  emoji: string | null;
  color: string | null;
  positionX: number | null;
  positionY: number | null;
  parentId: string | null;
  sectorId: string | null;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type BackupMemory = {
  id: string;
  title: string;
  body: string;
  memoryType: string;
  emotion: string | null;
  importance: number;
  aiImpact: string;
  aiSummary: string | null;
  transcript: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
  mediaName: string | null;
  nodeKind: string;
  tags: string[];
  accessCount: number;
  positionX: number | null;
  positionY: number | null;
  emoji: string | null;
  color: string | null;
  sourceUrl: string | null;
  sourceKind: string | null;
  createdAt: string;
  updatedAt: string;
  viewerType: ViewerType;
  extractedMetadata: JsonObject | null;
  artifactState: JsonObject | null;
  thumbDataUrl: string | null;
};

export type BackupDataset = {
  memoryId: string;
  archetype: string;
  sourceFilename: string;
  sourceFormat: string;
  schema: JsonObject;
  rows: { canonical: JsonObject; custom: JsonObject }[];
};

export type BackupLink = {
  memoryId: string;
  conceptId: string;
};

export type BackupConnection = {
  id: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  strength: number;
  reason: string | null;
  status: string;
  createdAt: string;
};

export type BackupAssistantMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

export type MindBackup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  settings: BackupSettings;
  concepts: BackupConcept[];
  memories: BackupMemory[];
  memoryConcepts: BackupLink[];
  connections: BackupConnection[];
  assistantMessages: BackupAssistantMessage[];
  datasets: BackupDataset[];
  draftJson: string | null;
};

export type BackupSummary = {
  branchCount: number;
  memoryCount: number;
  voiceCount: number;
  connectionCount: number;
  exportedAt: string;
  displayName: string;
};

export function summarizeBackup(backup: MindBackup): BackupSummary {
  return {
    branchCount: backup.concepts.length,
    memoryCount: backup.memories.length,
    voiceCount: backup.memories.filter((m) => m.memoryType === "voice" || Boolean(m.transcript) || Boolean(m.mediaUrl)).length,
    connectionCount: backup.connections.length,
    exportedAt: backup.exportedAt,
    displayName: backup.settings.displayName || "Mind",
  };
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNullableString(v: unknown): string | null {
  if (v == null) return null;
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asNullableNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function asIso(v: unknown): string {
  const s = asString(v);
  const d = Date.parse(s);
  return Number.isFinite(d) ? new Date(d).toISOString() : new Date().toISOString();
}

function asObject(v: unknown): JsonObject | null {
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObject) : null;
}

/** Viewer fields from a backup row; anything invalid or over its cap falls back to a plain memory. */
function viewerFields(m: Record<string, unknown>): Pick<BackupMemory, "viewerType" | "extractedMetadata" | "artifactState" | "thumbDataUrl"> {
  const rawType = m.viewerType ?? m.viewer_type;
  const fields = {
    viewerType: (typeof rawType === "string" && isViewerType(rawType) ? rawType : "plain") as ViewerType,
    extractedMetadata: asObject(m.extractedMetadata ?? m.extracted_metadata_json),
    artifactState: asObject(m.artifactState ?? m.artifact_state_json),
    thumbDataUrl: asNullableString(m.thumbDataUrl ?? m.thumb_data_url),
  };
  try {
    validateViewerFields(fields);
    return fields;
  } catch {
    let thumb: string | null = fields.thumbDataUrl;
    try {
      validateViewerFields({ viewerType: "plain", thumbDataUrl: thumb });
    } catch {
      thumb = null;
    }
    return { viewerType: "plain", extractedMetadata: null, artifactState: null, thumbDataUrl: thumb };
  }
}

function asTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).slice(0, 24);
  if (typeof v === "string") {
    try {
      return asTags(JSON.parse(v));
    } catch {
      return v
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 24);
    }
  }
  return [];
}

export function parseMindBackup(raw: unknown): { ok: true; backup: MindBackup } | { ok: false; error: string } {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return { ok: false, error: "That file is not valid JSON." };
    }
  }
  if (!raw || typeof raw !== "object") return { ok: false, error: "That file is empty." };
  const o = raw as Record<string, unknown>;
  if (o.format !== BACKUP_FORMAT) {
    return { ok: false, error: "This is not a MindMesh backup file." };
  }
  const version = asNumber(o.version, 0);
  if (version < 1 || version > BACKUP_VERSION) {
    return { ok: false, error: "This backup is from a newer MindMesh and cannot be restored here yet." };
  }
  const conceptsRaw = Array.isArray(o.concepts) ? o.concepts : [];
  const memoriesRaw = Array.isArray(o.memories) ? o.memories : [];
  if (conceptsRaw.length > 8000) return { ok: false, error: "Too many branches in this backup." };
  if (memoriesRaw.length > 8000) return { ok: false, error: "Too many memories in this backup." };

  const settingsRaw = o.settings && typeof o.settings === "object" ? (o.settings as Record<string, unknown>) : {};
  const plan = settingsRaw.plan === "pro" ? "pro" : "free";

  const concepts: BackupConcept[] = [];
  for (const row of conceptsRaw) {
    if (!row || typeof row !== "object") continue;
    const c = row as Record<string, unknown>;
    const id = asString(c.id).trim();
    const name = asString(c.name).trim();
    if (!id || !name) continue;
    concepts.push({
      id,
      name: name.slice(0, 80),
      kind: asString(c.kind, "topic").slice(0, 32),
      icon: asNullableString(c.icon),
      emoji: asNullableString(c.emoji),
      color: asNullableString(c.color),
      positionX: asNullableNumber(c.positionX ?? c.position_x),
      positionY: asNullableNumber(c.positionY ?? c.position_y),
      parentId: asNullableString(c.parentId ?? c.parent_id),
      sectorId: asNullableString(c.sectorId ?? c.sector_id),
      description: asString(c.description).slice(0, 4000),
      createdAt: asIso(c.createdAt ?? c.created_at),
      updatedAt: asIso(c.updatedAt ?? c.updated_at),
    });
  }

  const memories: BackupMemory[] = [];
  for (const row of memoriesRaw) {
    if (!row || typeof row !== "object") continue;
    const m = row as Record<string, unknown>;
    const id = asString(m.id).trim();
    const title = asString(m.title).trim() || "Untitled";
    if (!id) continue;
    memories.push({
      id,
      title: title.slice(0, 160),
      body: asString(m.body).slice(0, 200_000),
      memoryType: asString(m.memoryType ?? m.memory_type, "text").slice(0, 32),
      emotion: asNullableString(m.emotion),
      importance: Math.min(5, Math.max(1, Math.round(asNumber(m.importance, 3)))),
      aiImpact: asString(m.aiImpact ?? m.ai_impact, "medium").slice(0, 32),
      aiSummary: asNullableString(m.aiSummary ?? m.ai_summary),
      transcript: asNullableString(m.transcript),
      mediaUrl: asNullableString(m.mediaUrl ?? m.media_url),
      mediaMime: asNullableString(m.mediaMime ?? m.media_mime),
      mediaName: asNullableString(m.mediaName ?? m.media_name),
      nodeKind: asString(m.nodeKind ?? m.node_kind, "learning").slice(0, 32),
      tags: asTags(m.tags ?? m.tags_json),
      accessCount: Math.max(0, Math.round(asNumber(m.accessCount ?? m.access_count, 0))),
      positionX: asNullableNumber(m.positionX ?? m.position_x),
      positionY: asNullableNumber(m.positionY ?? m.position_y),
      emoji: asNullableString(m.emoji),
      color: asNullableString(m.color),
      sourceUrl: asNullableString(m.sourceUrl ?? m.source_url),
      sourceKind: asNullableString(m.sourceKind ?? m.source_kind),
      createdAt: asIso(m.createdAt ?? m.created_at),
      updatedAt: asIso(m.updatedAt ?? m.updated_at),
      ...viewerFields(m),
    });
  }

  const conceptIds = new Set(concepts.map((c) => c.id));
  const memoryIds = new Set(memories.map((m) => m.id));

  const linksRaw = Array.isArray(o.memoryConcepts) ? o.memoryConcepts : Array.isArray(o.memory_concepts) ? o.memory_concepts : [];
  const memoryConcepts: BackupLink[] = [];
  for (const row of linksRaw) {
    if (!row || typeof row !== "object") continue;
    const l = row as Record<string, unknown>;
    const memoryId = asString(l.memoryId ?? l.memory_id);
    const conceptId = asString(l.conceptId ?? l.concept_id);
    if (!memoryIds.has(memoryId) || !conceptIds.has(conceptId)) continue;
    memoryConcepts.push({ memoryId, conceptId });
  }

  const connRaw = Array.isArray(o.connections) ? o.connections : [];
  const connections: BackupConnection[] = [];
  for (const row of connRaw) {
    if (!row || typeof row !== "object") continue;
    const c = row as Record<string, unknown>;
    const id = asString(c.id).trim() || `conn-${connections.length}`;
    const sourceType = asString(c.sourceType ?? c.source_type);
    const targetType = asString(c.targetType ?? c.target_type);
    const sourceId = asString(c.sourceId ?? c.source_id);
    const targetId = asString(c.targetId ?? c.target_id);
    if (!sourceId || !targetId) continue;
    connections.push({
      id,
      sourceType,
      sourceId,
      targetType,
      targetId,
      strength: Math.min(1, Math.max(0, asNumber(c.strength, 0.5))),
      reason: asNullableString(c.reason),
      status: asString(c.status, "accepted").slice(0, 24),
      createdAt: asIso(c.createdAt ?? c.created_at),
    });
  }

  const msgRaw = Array.isArray(o.assistantMessages) ? o.assistantMessages : Array.isArray(o.assistant_messages) ? o.assistant_messages : [];
  const assistantMessages: BackupAssistantMessage[] = [];
  for (const row of msgRaw) {
    if (!row || typeof row !== "object") continue;
    const m = row as Record<string, unknown>;
    const content = asString(m.content).trim();
    if (!content) continue;
    assistantMessages.push({
      id: asString(m.id).trim() || `msg-${assistantMessages.length}`,
      role: asString(m.role, "assistant").slice(0, 16),
      content: content.slice(0, 20_000),
      createdAt: asIso(m.createdAt ?? m.created_at),
    });
  }

  const datasetsRaw = Array.isArray(o.datasets) ? o.datasets : [];
  if (datasetsRaw.length > 2000) return { ok: false, error: "Too many datasets in this backup." };
  const datasets: BackupDataset[] = [];
  const seenDatasetMemory = new Set<string>();
  for (const row of datasetsRaw) {
    if (!row || typeof row !== "object") continue;
    const d = row as Record<string, unknown>;
    const memoryId = asString(d.memoryId);
    const schema = asObject(d.schema);
    if (!memoryIds.has(memoryId) || seenDatasetMemory.has(memoryId) || !schema || !Array.isArray(d.rows)) continue;
    seenDatasetMemory.add(memoryId);
    datasets.push({
      memoryId,
      archetype: asString(d.archetype, "generic_table").slice(0, 40),
      sourceFilename: asString(d.sourceFilename, "dataset").slice(0, 255),
      sourceFormat: asString(d.sourceFormat, "csv").slice(0, 8),
      schema,
      rows: (d.rows as unknown[]).slice(0, 100_000).map((r) => {
        const x = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
        return { canonical: asObject(x.canonical ?? x.c) ?? {}, custom: asObject(x.custom ?? x.x) ?? {} };
      }),
    });
  }

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: asIso(o.exportedAt),
      settings: {
        displayName: asString(settingsRaw.displayName ?? settingsRaw.display_name).slice(0, 80),
        age: asNullableNumber(settingsRaw.age),
        onboarded: Boolean(settingsRaw.onboarded ?? true),
        plan,
        brainSectorsJson: asNullableString(settingsRaw.brainSectorsJson ?? settingsRaw.brain_sectors_json),
      },
      concepts,
      memories,
      memoryConcepts,
      connections,
      assistantMessages,
      datasets,
      draftJson:
        typeof o.draftJson === "string"
          ? o.draftJson
          : o.draft
            ? JSON.stringify(o.draft)
            : null,
    },
  };
}

export function backupFilename(backup?: MindBackup | null): string {
  const day = (backup?.exportedAt ? new Date(backup.exportedAt) : new Date()).toISOString().slice(0, 10);
  const who = backup?.settings.displayName?.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return `mindmesh${who ? `-${who}` : ""}-${day}.json`;
}

export function downloadBackupFile(backup: MindBackup) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = backupFilename(backup);
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
