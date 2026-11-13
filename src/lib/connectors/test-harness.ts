/**
 * In-memory PGLite with the repo's real migrations applied, for node:test.
 * Mirrors what src/lib/db.ts does at runtime (one transaction per file, sorted,
 * non-recursive) without importing it, since db.ts boots a database on import.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { makeSql, type Sql, type TxRunner } from "../sql-template.ts";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "migrations");

export function migrationFiles() {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export function migrationText(name: string) {
  return readFileSync(join(MIGRATIONS, name), "utf8");
}

export type TestDb = { pg: PGlite; sql: Sql; transaction: TxRunner; migrate: (upTo?: string) => Promise<void> };

export async function openTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  await pg.waitReady;
  const sql = makeSql(async <T>(text: string, params: unknown[]) => (await pg.query<T>(text, params)).rows);
  const transaction: TxRunner = (fn) =>
    pg.transaction((tx) => fn(makeSql(async <T>(text: string, params: unknown[]) => (await tx.query<T>(text, params)).rows)));
  await pg.exec("create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())");
  /** Apply pending migrations in order, stopping after `upTo` when given. */
  const migrate = async (upTo?: string) => {
    const applied = new Set((await pg.query<{ name: string }>("select name from _migrations")).rows.map((r) => r.name));
    for (const name of migrationFiles()) {
      if (applied.has(name)) continue;
      const text = migrationText(name);
      await pg.transaction(async (tx) => {
        await tx.exec(text);
        await tx.query("insert into _migrations (name) values ($1)", [name]);
      });
      if (upTo && name === upTo) return;
    }
  };
  return { pg, sql, transaction, migrate };
}

let seq = 0;
/** Stable, readable test ids (valid path segments, like the app's UUIDs). */
export function tid(label: string) {
  seq += 1;
  return `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${seq}`;
}

/** Insert a branch the way createBranch does (row + parent synapse). */
export async function addBranch(
  sql: Sql,
  userId: string,
  name: string,
  opts: { parentId?: string | null; sectorId?: string | null; id?: string } = {},
) {
  const id = opts.id ?? tid(name);
  await sql`
    insert into concepts (id, user_id, name, kind, parent_id, sector_id)
    values (${id}, ${userId}, ${name}, 'topic', ${opts.parentId ?? null}, ${opts.sectorId ?? null})
  `;
  if (opts.parentId) {
    await sql`
      insert into connections (id, user_id, source_type, source_id, target_type, target_id, strength, reason, status)
      values (${tid("syn")}, ${userId}, 'concept', ${opts.parentId}, 'concept', ${id}, 0.8, 'branch', 'accepted')
    `;
  }
  return id;
}

/** Insert a memory bound to a branch the way createMemory does (row + link + synapse). */
export async function addMemory(
  sql: Sql,
  userId: string,
  title: string,
  branchIds: string[],
  opts: { body?: string; tags?: string[]; linkedAt?: string[] } = {},
) {
  const id = tid(title);
  await sql`
    insert into memories (id, user_id, title, body, tags_json)
    values (${id}, ${userId}, ${title}, ${opts.body ?? `${title} body`}, ${JSON.stringify(opts.tags ?? [])})
  `;
  for (let i = 0; i < branchIds.length; i += 1) {
    const at = opts.linkedAt?.[i] ?? null;
    await sql`insert into memory_concepts (user_id, memory_id, concept_id) values (${userId}, ${id}, ${branchIds[i]})`;
    await sql`
      insert into connections (id, user_id, source_type, source_id, target_type, target_id, strength, reason, status, created_at)
      values (${tid("syn")}, ${userId}, 'memory', ${id}, 'concept', ${branchIds[i]}, 0.7, 'auto', 'accepted',
              coalesce(${at}::timestamptz, now()))
    `;
  }
  return id;
}

/**
 * The validation brain from the architecture doc: Frontal Lobe holds
 * Work-Life > Real-Estate > Wholesaling, Work-Life > SaaS CRM, and Ideas.
 */
export async function seedValidationBrain(sql: Sql, userId: string) {
  const workLife = await addBranch(sql, userId, "Work-Life", { sectorId: "frontal" });
  const realEstate = await addBranch(sql, userId, "Real-Estate", { parentId: workLife, sectorId: "frontal" });
  const wholesaling = await addBranch(sql, userId, "Wholesaling", { parentId: realEstate, sectorId: "frontal" });
  const saas = await addBranch(sql, userId, "SaaS CRM", { parentId: workLife, sectorId: "frontal" });
  const ideas = await addBranch(sql, userId, "Ideas", { sectorId: "frontal" });
  const family = await addBranch(sql, userId, "Family", { sectorId: "temporal" });
  const golf = await addBranch(sql, userId, "Golf", { sectorId: "cerebellum" });
  const taxes = await addBranch(sql, userId, "Taxes", { sectorId: "brainstem" });
  const m = {
    ideaList: await addMemory(sql, userId, "Idea list", [ideas], { tags: ["ideas"] }),
    capRate: await addMemory(sql, userId, "Cap rate notes", [realEstate], { body: "Cap rate is NOI over price", tags: ["deals"] }),
    assignment: await addMemory(sql, userId, "Assignment fee script", [wholesaling], { body: "Script for the assignment fee call", tags: ["deals", "script"] }),
    crmPricing: await addMemory(sql, userId, "CRM pricing", [saas], { body: "Tiered pricing for the CRM" }),
    balance: await addMemory(sql, userId, "Work-life balance rule", [workLife], { body: "No calls after 7pm" }),
    birthday: await addMemory(sql, userId, "Mom birthday", [family], { body: "Mom birthday is in May, call script ready" }),
    grip: await addMemory(sql, userId, "Driver grip", [golf], { body: "Neutral grip" }),
    deadline: await addMemory(sql, userId, "1031 deadline", [taxes], { body: "45 day identification window for the deal" }),
  };
  return { b: { workLife, realEstate, wholesaling, saas, ideas, family, golf, taxes }, m };
}
