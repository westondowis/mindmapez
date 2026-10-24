import type { NodeKind } from "./types";

export const KIND_TONE: Record<
  NodeKind,
  "gold" | "learning" | "success" | "problem" | "idea" | "muted"
> = {
  breakthrough: "gold",
  learning: "learning",
  success: "success",
  problem: "problem",
  idea: "idea",
  archived: "muted",
};

export const KIND_COLOR: Record<NodeKind, string> = {
  breakthrough: "var(--color-gold)",
  learning: "var(--color-learning)",
  success: "var(--color-success)",
  problem: "var(--color-problem)",
  idea: "var(--color-idea)",
  archived: "var(--color-archived)",
};

export const KIND_LABEL: Record<NodeKind, string> = {
  breakthrough: "Breakthrough",
  learning: "Learning",
  success: "Success",
  problem: "Problem",
  idea: "Idea",
  archived: "Archived",
};
