export const NODE_COLORS = [
  { id: "gold", label: "Gold", css: "var(--color-highlight)" },
  { id: "cyan", label: "Cyan", css: "var(--color-primary)" },
  { id: "teal", label: "Teal", css: "var(--color-secondary)" },
  { id: "sky", label: "Sky", css: "var(--color-learning)" },
  { id: "green", label: "Green", css: "var(--color-success)" },
  { id: "rose", label: "Rose", css: "var(--color-problem)" },
  { id: "violet", label: "Violet", css: "var(--color-idea)" },
  { id: "slate", label: "Slate", css: "var(--color-archived)" },
] as const;

export type NodeColorId = (typeof NODE_COLORS)[number]["id"];

export function nodeColorCss(id: string | null | undefined): string {
  return NODE_COLORS.find((c) => c.id === id)?.css ?? "var(--color-primary)";
}
