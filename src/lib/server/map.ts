import { assignSectorFromName, normalizeSectorId } from "@/lib/brain";
import type {
  Concept,
  ConceptKind,
  GraphConnection,
  ImpactLevel,
  Memory,
  MemoryType,
  NodeKind,
  SourceKind,
} from "@/lib/types";

export type MemoryRow = {
  id: string;
  title: string;
  body: string;
  memory_type: string;
  emotion: string | null;
  importance: number;
  ai_impact: string;
  ai_summary: string | null;
  transcript: string | null;
  media_url: string | null;
  media_mime: string | null;
  media_name: string | null;
  node_kind: string;
  tags_json: string;
  access_count: number;
  position_x: number | null;
  position_y: number | null;
  emoji: string | null;
  color: string | null;
  source_url?: string | null;
  source_kind?: string | null;
  created_at: string;
  updated_at: string;
};

export type ConceptRow = {
  id: string;
  name: string;
  kind: string;
  icon: string | null;
  emoji: string | null;
  color: string | null;
  position_x: number | null;
  position_y: number | null;
  created_at: string;
  memory_count?: number;
  parent_id?: string | null;
  sector_id?: string | null;
  description?: string | null;
  updated_at?: string | null;
};

export type ConnectionRow = {
  id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  strength: number;
  reason: string | null;
  status: string;
};

function parseTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function mapMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    memoryType: row.memory_type as MemoryType,
    emotion: row.emotion,
    importance: Number(row.importance) || 3,
    aiImpact: (row.ai_impact as ImpactLevel) || "medium",
    aiSummary: row.ai_summary,
    transcript: row.transcript,
    mediaUrl: row.media_url,
    mediaMime: row.media_mime,
    mediaName: row.media_name,
    nodeKind: (row.node_kind as NodeKind) || "learning",
    tags: parseTags(row.tags_json),
    accessCount: Number(row.access_count) || 0,
    positionX: row.position_x,
    positionY: row.position_y,
    emoji: row.emoji ?? null,
    color: row.color ?? null,
    sourceUrl: row.source_url ?? null,
    sourceKind: (row.source_kind as SourceKind) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapConcept(row: ConceptRow): Concept {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as ConceptKind,
    icon: row.icon,
    emoji: row.emoji ?? null,
    color: row.color ?? null,
    memoryCount: Number(row.memory_count) || 0,
    positionX: row.position_x,
    positionY: row.position_y,
    createdAt: row.created_at,
    parentId: row.parent_id ?? null,
    sectorId: normalizeSectorId(row.sector_id) || assignSectorFromName(row.name),
    description: row.description ?? "",
    updatedAt: row.updated_at ?? row.created_at,
  };
}

export function mapConnection(row: ConnectionRow): GraphConnection {
  return {
    id: row.id,
    sourceType: row.source_type as "memory" | "concept",
    sourceId: row.source_id,
    targetType: row.target_type as "memory" | "concept",
    targetId: row.target_id,
    strength: Number(row.strength) || 0.5,
    reason: row.reason,
    status: row.status as GraphConnection["status"],
  };
}
