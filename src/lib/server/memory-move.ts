import { createServerFn } from "@tanstack/react-start";
import { branchKindForDepth, isSectorId } from "@/lib/brain";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, withTransaction } from "@/lib/db";
import { newBranchPosition } from "@/lib/branch-memories";
import { checkNewBranchName } from "@/lib/memory-move";
import { newId } from "@/lib/utils";
import { linkParent } from "./branches";

type ConceptLite = { id: string; parent_id: string | null; sector_id: string | null; position_x: number | null; position_y: number | null };

/**
 * Relocate a memory to one branch: either an existing branch/sub-branch (conceptId) or a brand-new branch
 * created under a parent or at the top of a sector (newBranch). The memory keeps exactly one home afterwards:
 * its old branch links (and their synapse edges) are replaced in the same transaction.
 */
export const moveMemory = createServerFn({ method: "POST" })
  .validator((d: { memoryId: string; conceptId?: string | null; newBranch?: { name: string; parentId?: string | null; sectorId?: string | null } }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const userId = context.userId;
    const sql = await getSql();
    const mem = await sql<{ id: string }>`select id from memories where id = ${data.memoryId} and user_id = ${userId}`;
    if (!mem[0]) return { ok: false as const, error: "Memory not found." };

    let targetId: string | null = null;
    let create: { id: string; name: string; parentId: string | null; sectorId: string; depth: number; posX: number; posY: number } | null = null;

    if (data.newBranch) {
      const nm = checkNewBranchName(data.newBranch.name ?? "");
      if (!nm.ok) return { ok: false as const, error: nm.error };
      const all = await sql<ConceptLite>`select id, parent_id, sector_id, position_x, position_y from concepts where user_id = ${userId}`;
      const parentId = data.newBranch.parentId ?? null;
      let sectorId = data.newBranch.sectorId ?? null;
      let depth = 0;
      let parent: ConceptLite | null = null;
      if (parentId) {
        parent = all.find((c) => c.id === parentId) ?? null;
        if (!parent) return { ok: false as const, error: "That parent branch is gone." };
        sectorId = parent.sector_id;
        depth = 1 + (parent.parent_id ? 1 : 0);
        const seen = new Set<string>();
        let walk: ConceptLite = parent;
        while (walk.parent_id && !seen.has(walk.id)) {
          seen.add(walk.id);
          const next = all.find((c) => c.id === walk.parent_id);
          if (!next) break;
          walk = next;
          depth += 1;
        }
      }
      if (!sectorId || !isSectorId(sectorId)) return { ok: false as const, error: "Pick a sector for the new branch." };
      const siblings = all.filter((c) => (c.parent_id ?? null) === parentId && (parentId ? true : c.sector_id === sectorId)).length;
      const pos = newBranchPosition(parent ? { positionX: parent.position_x, positionY: parent.position_y } : null, siblings);
      create = { id: newId(), name: nm.name, parentId, sectorId, depth, posX: pos.x, posY: pos.y };
      targetId = create.id;
    } else {
      const c = data.conceptId ? await sql<{ id: string }>`select id from concepts where id = ${data.conceptId} and user_id = ${userId}` : [];
      if (!c[0]) return { ok: false as const, error: "Pick a branch to move this memory to." };
      targetId = c[0].id;
    }

    try {
      await withTransaction(async (tx) => {
        if (create) {
          await tx`
            insert into concepts (id, user_id, name, kind, icon, emoji, color, description, parent_id, sector_id, position_x, position_y, updated_at)
            values (${create.id}, ${userId}, ${create.name}, ${branchKindForDepth(create.depth)}, ${"brain"}, ${"🧠"}, ${"cyan"}, ${""},
                    ${create.parentId}, ${create.sectorId}, ${create.posX}, ${create.posY}, now())
          `;
          await linkParent(tx, userId, create.parentId, create.id);
        }
        await tx`delete from memory_concepts where user_id = ${userId} and memory_id = ${data.memoryId}`;
        await tx`
          delete from connections
          where user_id = ${userId} and (
            (source_type = 'memory' and source_id = ${data.memoryId} and target_type = 'concept') or
            (target_type = 'memory' and target_id = ${data.memoryId} and source_type = 'concept')
          )
        `;
        await tx`insert into memory_concepts (user_id, memory_id, concept_id) values (${userId}, ${data.memoryId}, ${targetId}) on conflict do nothing`;
        await tx`
          insert into connections (id, user_id, source_type, source_id, target_type, target_id, strength, reason, status)
          values (${newId()}, ${userId}, 'memory', ${data.memoryId}, 'concept', ${targetId}, 0.9, ${"moved"}, 'accepted')
        `;
        await tx`update memories set updated_at = now() where id = ${data.memoryId} and user_id = ${userId}`;
        await tx`update user_settings set last_saved_at = now() where user_id = ${userId}`;
      });
    } catch (err) {
      console.error("moveMemory failed", err);
      return { ok: false as const, error: "Could not move that memory." };
    }
    return { ok: true as const, conceptId: targetId! };
  });
