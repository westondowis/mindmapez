export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const pieces = String(raw)
      .split(/[,;]+/)
      .map((p) => p.replace(/^#/, "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    for (const piece of pieces) {
      const key = piece.toLowerCase();
      if (seen.has(key) || piece.length > 48) continue;
      seen.add(key);
      out.push(piece);
      if (out.length >= 16) return out;
    }
  }
  return out;
}

export function mergeTags(user: string[] | undefined, generated: string[]): string[] {
  return normalizeTags([...(user ?? []), ...generated]);
}
