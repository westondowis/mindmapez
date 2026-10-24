import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { BRAIN_SECTORS, assignSectorFromName } from "@/lib/brain";
import { getSql } from "@/lib/db";
import { NODE_COLORS } from "@/lib/node-colors";
import { newId } from "@/lib/utils";
import { ensureUserSettings } from "./seed";

export type WalkthroughMap = {
  name: string;
  emoji: string;
  color: string;
};

function ring(index: number, total: number, radius: number) {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

export const startWalkthrough = createServerFn({ method: "POST" })
  .validator((input: { name: string; age: number; maps: WalkthroughMap[] }) => {
    const name = input.name.trim();
    if (name.length < 1 || name.length > 80) throw new Error("Name is required");
    const age = Number(input.age);
    if (!Number.isFinite(age) || age < 1 || age > 120) throw new Error("Enter a real age");
    const maps = input.maps
      .map((m) => ({
        name: m.name.trim(),
        emoji: (m.emoji || "🧠").slice(0, 8),
        color: NODE_COLORS.some((c) => c.id === m.color) ? m.color : "cyan",
      }))
      .filter((m) => m.name.length > 0)
      .slice(0, 8);
    if (maps.length < 2) throw new Error("Add at least two mind maps");
    return { name, age: Math.round(age), maps };
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureUserSettings(sql, context.userId);

    await sql`
      update user_settings
      set display_name = ${data.name}, age = ${data.age}, onboarded = false
      where user_id = ${context.userId}
    `;

    await sql`delete from connections where user_id = ${context.userId}`;
    await sql`delete from memory_concepts where user_id = ${context.userId}`;
    await sql`delete from memories where user_id = ${context.userId}`;
    await sql`delete from concepts where user_id = ${context.userId}`;

    const created: { id: string; name: string; emoji: string; color: string }[] = [];
    for (const [i, map] of data.maps.entries()) {
      const id = newId();
      const p = ring(i, data.maps.length, 300);
      const sectorId = BRAIN_SECTORS[i % BRAIN_SECTORS.length]?.id ?? assignSectorFromName(map.name);
      await sql`
        insert into concepts (id, user_id, name, kind, icon, emoji, color, sector_id, position_x, position_y)
        values (${id}, ${context.userId}, ${map.name}, 'category', 'brain', ${map.emoji}, ${map.color}, ${sectorId}, ${p.x}, ${p.y})
      `;
      created.push({ id, name: map.name, emoji: map.emoji, color: map.color });
    }

    return { ok: true as const, maps: created };
  });

export const finishWalkthrough = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await ensureUserSettings(sql, context.userId);
    await sql`
      update user_settings set onboarded = true where user_id = ${context.userId}
    `;
    return { ok: true as const };
  });
