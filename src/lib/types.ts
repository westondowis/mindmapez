import type { BrainSector } from "@/lib/brain";

export const MEMORY_TYPES = [
  "voice",
  "text",
  "photo",
  "video",
  "document",
  "thought",
  "reflection",
  "link",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export const NODE_KINDS = [
  "breakthrough",
  "learning",
  "success",
  "problem",
  "idea",
  "archived",
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const EMOTIONS = [
  "Excited",
  "Inspired",
  "Confident",
  "Frustrated",
  "Happy",
  "Concerned",
  "Motivated",
  "Curious",
  "Grateful",
  "Calm",
  "Proud",
  "Anxious",
] as const;
export type Emotion = (typeof EMOTIONS)[number];

export const IMPACT_LEVELS = ["low", "medium", "high", "life_changing"] as const;
export type ImpactLevel = (typeof IMPACT_LEVELS)[number];

export const CONCEPT_KINDS = [
  "category",
  "subcategory",
  "topic",
  "theme",
  "person",
  "place",
  "emotion",
  "lesson",
  "pattern",
] as const;
export type ConceptKind = (typeof CONCEPT_KINDS)[number];

export const CONNECTION_STATUSES = ["accepted", "suggested", "rejected"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export type Plan = "free" | "pro";

export const SOURCE_KINDS = ["article", "podcast", "youtube", "rss", "other"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export type Memory = {
  id: string;
  title: string;
  body: string;
  memoryType: MemoryType;
  emotion: string | null;
  importance: number;
  aiImpact: ImpactLevel;
  aiSummary: string | null;
  transcript: string | null;
  mediaUrl: string | null;
  mediaMime: string | null;
  mediaName: string | null;
  nodeKind: NodeKind;
  tags: string[];
  accessCount: number;
  positionX: number | null;
  positionY: number | null;
  emoji: string | null;
  color: string | null;
  sourceUrl: string | null;
  sourceKind: SourceKind | null;
  createdAt: string;
  updatedAt: string;
};

export type MemoryDetail = Memory & {
  concepts: { id: string; name: string; kind: ConceptKind }[];
  related: { id: string; title: string; nodeKind: NodeKind; strength: number }[];
  connectedConcepts: { id: string; name: string; kind: ConceptKind }[];
};

export type Concept = {
  id: string;
  name: string;
  kind: ConceptKind;
  icon: string | null;
  emoji: string | null;
  color: string | null;
  memoryCount: number;
  positionX: number | null;
  positionY: number | null;
  createdAt: string;
  parentId: string | null;
  sectorId: string;
  description: string;
  updatedAt: string;
};

export type GraphConnection = {
  id: string;
  sourceType: "memory" | "concept";
  sourceId: string;
  targetType: "memory" | "concept";
  targetId: string;
  strength: number;
  reason: string | null;
  status: ConnectionStatus;
};

export type GraphPayload = {
  displayName: string;
  onboarded: boolean;
  plan: Plan;
  memoryCount: number;
  voiceCount: number;
  connectionCount: number;
  concepts: Concept[];
  memories: Memory[];
  connections: GraphConnection[];
  suggested: GraphConnection[];
  lastSavedAt: string | null;
  sectors: BrainSector[];
};

export type DashboardStats = {
  plan: Plan;
  memoryCount: number;
  voiceCount: number;
  connectionCount: number;
  photoCount: number;
  topTopics: { name: string; count: number }[];
  growingConcepts: { name: string; count: number }[];
  topEmotions: { name: string; count: number }[];
  recent: Memory[];
  favorites: Memory[];
  suggested: {
    id: string;
    reason: string | null;
    strength: number;
    a: { type: string; id: string; label: string };
    b: { type: string; id: string; label: string };
  }[];
};

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type OrganizeResult = {
  title: string;
  summary: string;
  tags: string[];
  emotion: Emotion;
  importance: number;
  impact: ImpactLevel;
  kind: NodeKind;
  concepts: { name: string; kind: ConceptKind }[];
};

export const FREE_MEMORY_LIMIT = 500;

export const REFLECTION_PROMPTS = [
  "What did you learn today?",
  "What should future-you remember?",
  "What worked today?",
  "What failed today?",
  "What surprised you today?",
];
