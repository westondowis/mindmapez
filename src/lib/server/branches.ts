import { createServerFn } from "@tanstack/react-start";
import { assignSectorFromName, branchKindForDepth, descendantsOf, isSectorId, mergeSectors, overridesFromSectors, wouldCycle } from "@/lib/brain";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { newId } from "@/lib/utils";
import { mapConcept, type ConceptRow } from "./map";
import { ensureUserSettings } from "./seed";

async function loadUserConcepts(userId: string) {
  const sql = await getSql();
  const rows = await sql<ConceptRow>`
    select c.*, 0::int as memory_count
    from concepts c
    where c.user_id = ${userId}
  `;
  return rows.map(mapConcept);
}

async function loadOne(userId: string, id: string) {
  const sql = await getSql();
  const rows = await sql<ConceptRow>`
    select c.*, 0::int as memory_count from concepts c
    where c.id = ${id} and c.user_id = ${userId}
  `;
  return rows[0] ? mapConcept(rows[0]) : null;
}

async function linkParent(userId: string, parentId: string | null, childId: string) {
  const sql = await getSql();
  await sql`
    delete from connections
    where user_id = ${userId}
      and source_type = 'concept' and target_type = 'concept'
      and target_id = ${childId}
  `;
  if (!parentId) return;
  await sql`
    insert into connections (
      id, user_id, source_type, source_id, target_type, target_id, strength, reason, status
    ) values (
      ${newId()}, ${userId}, 'concept', ${parentId}, 'concept', ${childId}, 0.8, ${"branch"}, 'accepted'
    )
  `;
}

export const createBranch = createServerFn({ method: "POST" })
  .validator((input: {
    name: string;
    description?: string;
    parentId?: string | null;
    sectorId?: string | null;
    emoji?: string | null;
    color?: string | null;
    icon?: string | null;
  }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const name = data.name.trim();
    if (!name) return { ok: false as const, error: "Give the branch a name." };
    if (name.length > 80) return { ok: false as const, error: "Keep the name under 80 characters." };

    const sql = await getSql();
    await ensureUserSettings(sql, context.userId);
    const concepts = await loadUserConcepts(context.userId);

    let parentId = data.parentId ?? null;
    let sectorId = data.sectorId ?? null;
    let depth = 0;

    if (parentId) {
      const parent = concepts.find((c) => c.id === parentId);
      if (!parent) return { ok: false as const, error: "That parent branch is gone." };
      sectorId = parent.sectorId;
      depth = 1 + (parent.parentId ? 1 : 0);
      let walk = parent;
      const seen = new Set<string>();
      while (walk.parentId && !seen.has(walk.id)) {
        seen.add(walk.id);
        const next = concepts.find((c) => c.id === walk.parentId);
        if (!next) break;
        walk = next;
        depth += 1;
      }
    } else {
      if (!isSectorId(sectorId)) sectorId = assignSectorFromName(name);
      depth = 0;
    }

    const id = newId();
    const kind = branchKindForDepth(depth);
    const emoji = data.emoji?.trim() || "🧠";
    const color = data.color?.trim() || "cyan";
    const icon = data.icon?.trim() || "brain";
    const description = (data.description ?? "").trim();

    const siblings = concepts.filter((c) => (c.parentId ?? null) === parentId && (!parentId ? c.sectorId === sectorId : true));
    const angle = (siblings.length / Math.max(siblings.length + 1, 1)) * Math.PI * 2 - Math.PI / 2;
    const radius = parentId ? 180 : 260;
    const posX = Math.cos(angle) * radius;
    const posY = Math.sin(angle) * radius;

    try {
      await sql`
        insert into concepts (
          id, user_id, name, kind, icon, emoji, color, description,
          parent_id, sector_id, position_x, position_y, updated_at
        ) values (
          ${id}, ${context.userId}, ${name}, ${kind}, ${icon}, ${emoji}, ${color}, ${description},
          ${parentId}, ${sectorId}, ${posX}, ${posY}, now()
        )
      `;
      await linkParent(context.userId, parentId, id);
      await sql`update user_settings set last_saved_at = now() where user_id = ${context.userId}`;
      const created = await loadOne(context.userId, id);
      return { ok: true as const, branch: created };
    } catch (err) {
      console.error("createBranch failed", err);
      return { ok: false as const, error: err instanceof Error ? err.message : "Could not create that branch." };
    }
  });

export const updateBranch = createServerFn({ method: "POST" })
  .validator((input: {
    id: string;
    name?: string;
    description?: string;
    emoji?: string | null;
    color?: string | null;
    icon?: string | null;
  }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const existing = await loadOne(context.userId, data.id);
    if (!existing) return { ok: false as const, error: "Branch not found." };
    const name = data.name !== undefined ? data.name.trim() : existing.name;
    if (!name) return { ok: false as const, error: "Give the branch a name." };
    const description = data.description !== undefined ? data.description.trim() : existing.description;
    const emoji = data.emoji === undefined ? existing.emoji : data.emoji;
    const color = data.color === undefined ? existing.color : data.color;
    const icon = data.icon === undefined ? existing.icon : data.icon;
    const sql = await getSql();
    await sql`
      update concepts
      set name = ${name}, description = ${description}, emoji = ${emoji},
          color = ${color}, icon = ${icon}, updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}
    `;
    await sql`update user_settings set last_saved_at = now() where user_id = ${context.userId}`;
    return { ok: true as const, branch: await loadOne(context.userId, data.id) };
  });

export const moveBranch = createServerFn({ method: "POST" })
  .validator((input: { id: string; parentId?: string | null; sectorId?: string | null }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const concepts = await loadUserConcepts(context.userId);
    const branch = concepts.find((c) => c.id === data.id);
    if (!branch) return { ok: false as const, error: "Branch not found." };
    const parentId = data.parentId === undefined ? branch.parentId : data.parentId;
    if (wouldCycle(concepts, data.id, parentId)) {
      return { ok: false as const, error: "A branch can’t be moved under itself or one of its children." };
    }
    let sectorId = data.sectorId ?? branch.sectorId;
    let depth = 0;
    if (parentId) {
      const parent = concepts.find((c) => c.id === parentId);
      if (!parent) return { ok: false as const, error: "That parent branch is gone." };
      sectorId = parent.sectorId;
      depth = 1;
      let walk = parent;
      const seen = new Set<string>();
      while (walk.parentId && !seen.has(walk.id)) {
        seen.add(walk.id);
        const next = concepts.find((c) => c.id === walk.parentId);
        if (!next) break;
        walk = next;
        depth += 1;
      }
    } else if (!isSectorId(sectorId)) {
      sectorId = assignSectorFromName(branch.name);
    }
    const kind = branchKindForDepth(depth);
    const sql = await getSql();
    await sql`
      update concepts
      set parent_id = ${parentId}, sector_id = ${sectorId}, kind = ${kind}, updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}
    `;
    const down = descendantsOf(concepts, data.id);
    for (const id of down) {
      await sql`
        update concepts set sector_id = ${sectorId}, updated_at = now()
        where id = ${id} and user_id = ${context.userId}
      `;
    }
    await linkParent(context.userId, parentId, data.id);
    await sql`update user_settings set last_saved_at = now() where user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const duplicateBranch = createServerFn({ method: "POST" })
  .validator((input: { id: string; includeChildren?: boolean }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const concepts = await loadUserConcepts(context.userId);
    const branch = concepts.find((c) => c.id === data.id);
    if (!branch) return { ok: false as const, error: "Branch not found." };
    const sql = await getSql();
    const include = Boolean(data.includeChildren);
    const idMap = new Map<string, string>();
    const queue = [branch.id];
    idMap.set(branch.id, newId());
    if (include) {
      for (const id of descendantsOf(concepts, branch.id)) {
        idMap.set(id, newId());
        queue.push(id);
      }
    }
    try {
      for (const oldId of queue) {
        const src = concepts.find((c) => c.id === oldId);
        if (!src) continue;
        const newIdValue = idMap.get(oldId)!;
        const parentId =
          oldId === branch.id
            ? src.parentId
            : src.parentId
              ? (idMap.get(src.parentId) ?? src.parentId)
              : null;
        const name = oldId === branch.id ? `${src.name} copy` : src.name;
        await sql`
          insert into concepts (
            id, user_id, name, kind, icon, emoji, color, description,
            parent_id, sector_id, position_x, position_y, updated_at
          ) values (
            ${newIdValue}, ${context.userId}, ${name}, ${src.kind}, ${src.icon}, ${src.emoji},
            ${src.color}, ${src.description}, ${parentId}, ${src.sectorId},
            ${(src.positionX ?? 0) + 36}, ${(src.positionY ?? 0) + 36}, now()
          )
        `;
        await linkParent(context.userId, parentId, newIdValue);
      }
      await sql`update user_settings set last_saved_at = now() where user_id = ${context.userId}`;
      return { ok: true as const, id: idMap.get(branch.id)! };
    } catch (err) {
      console.error("duplicateBranch failed", err);
      return { ok: false as const, error: "Could not duplicate that branch." };
    }
  });

export const deleteBranch = createServerFn({ method: "POST" })
  .validator((input: { id: string; mode: "cascade" | "reparent" }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const concepts = await loadUserConcepts(context.userId);
    const branch = concepts.find((c) => c.id === data.id);
    if (!branch) return { ok: false as const, error: "Branch not found." };
    const kids = concepts.filter((c) => c.parentId === data.id);
    const sql = await getSql();
    const removeIds = [data.id];
    if (data.mode === "cascade") {
      removeIds.push(...descendantsOf(concepts, data.id));
    } else {
      for (const kid of kids) {
        await sql`
          update concepts
          set parent_id = ${branch.parentId},
              sector_id = ${branch.sectorId},
              kind = ${branch.parentId ? kid.kind : "category"},
              updated_at = now()
          where id = ${kid.id} and user_id = ${context.userId}
        `;
        await linkParent(context.userId, branch.parentId, kid.id);
      }
    }
    for (const id of removeIds) {
      await sql`
        delete from connections
        where user_id = ${context.userId}
          and ((source_type = 'concept' and source_id = ${id}) or (target_type = 'concept' and target_id = ${id}))
      `;
      await sql`delete from memory_concepts where user_id = ${context.userId} and concept_id = ${id}`;
      await sql`delete from concepts where id = ${id} and user_id = ${context.userId}`;
    }
    await sql`update user_settings set last_saved_at = now() where user_id = ${context.userId}`;
    return { ok: true as const, removed: removeIds.length };
  });

export const saveBrainSectors = createServerFn({ method: "POST" })
  .validator((input: {
    sectors: { id: string; label: string; kicker: string; emoji: string; color: string }[];
  }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const merged = mergeSectors(
      data.sectors.map((s) => ({
        id: s.id,
        label: s.label,
        kicker: s.kicker,
        emoji: s.emoji,
        color: s.color,
      })),
    );
    for (const sector of merged) {
      const incoming = data.sectors.find((s) => s.id === sector.id);
      if (incoming) {
        const label = incoming.label.trim();
        if (!label) return { ok: false as const, error: "Every main branch needs a name." };
        if (label.length > 32) return { ok: false as const, error: "Keep main branch names under 32 characters." };
        sector.label = label;
        sector.kicker = incoming.kicker.trim().slice(0, 48) || sector.kicker;
        sector.emoji = incoming.emoji.trim().slice(0, 8) || sector.emoji;
        sector.color = incoming.color.trim() || sector.color;
      }
    }
    const json = JSON.stringify(overridesFromSectors(merged));
    const sql = await getSql();
    await ensureUserSettings(sql, context.userId);
    await sql`
      update user_settings
      set brain_sectors_json = ${json}, last_saved_at = now()
      where user_id = ${context.userId}
    `;
    return { ok: true as const, sectors: merged };
  });
