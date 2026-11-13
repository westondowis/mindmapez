-- Connector security engine (v5.26).
-- Additive and idempotent: new columns, tables, functions and triggers only; no
-- existing column is changed or dropped. Safe to re-run. Reverse with
-- migrations/rollback/0010_connector_security.down.sql (not auto-applied).
--
-- 1. concepts.path   materialized branch path '/<sector>/<id>/<id>/.../' (collate "C")
-- 2. memories.owner_branch_id   the one branch a memory is bound to (connector visibility)
-- 3. connectors, connector_grants, connector_audit_logs (append-only, hash-chained)
-- 4. pending_reviews: connector provenance + target branch
-- 5. Optional row-level security for the brain_connector role. Wrapped so a host
--    that forbids role creation (some managed Postgres plans) logs a notice and
--    keeps going instead of failing the migration.

-- ---------------------------------------------------------------------------
-- Path helpers
-- ---------------------------------------------------------------------------
-- One path segment per id. UUIDs (all ids newId() makes) pass through; any other
-- id becomes '~' || md5(id), which no plain id can equal, so segments never collide
-- and can never contain the '/' separator.
create or replace function brain_path_label(v text) returns text
language sql immutable as $$
  select case when v ~ '^[A-Za-z0-9-]+$' then v else '~' || md5(coalesce(v, '')) end
$$;

-- Sector segment of a path. Mirrors normalizeSectorId() in src/lib/brain.ts:
-- legacy sector names map to their lobe; anything unknown lands in 'unsorted',
-- which only a Full Brain grant covers (fail closed).
create or replace function brain_sector_key(v text) returns text
language sql immutable as $$
  select case
    when v in ('frontal', 'parietal', 'temporal', 'occipital', 'cerebellum', 'brainstem') then v
    when v = 'ideas' then 'frontal'
    when v in ('goals', 'learning') then 'parietal'
    when v in ('strategy', 'creativity') then 'temporal'
    when v = 'growth' then 'occipital'
    when v = 'action' then 'cerebellum'
    when v = 'insights' then 'brainstem'
    else 'unsorted'
  end
$$;

-- Exclusive upper bound of the subtree range [p, brain_path_end(p)).
-- Every path ends in '/' (0x2F); '0' (0x30) is the next byte, so in "C" order
-- exactly the paths that start with p fall inside the range.
create or replace function brain_path_end(p text) returns text
language sql immutable as $$
  select (left(p, -1) || '0') collate "C"
$$;

-- ---------------------------------------------------------------------------
-- 1. Materialized branch paths
-- ---------------------------------------------------------------------------
alter table concepts add column if not exists path text collate "C";
alter table concepts add column if not exists depth integer;
create index if not exists concepts_user_path_idx on concepts (user_id, path);

-- Backfill from the existing parent_id tree. Roots (and rows whose parent is
-- missing) start at their own sector; depth is capped to survive any legacy cycle.
with recursive t(id, user_id, path, depth) as (
  select c.id, c.user_id,
         ('/' || brain_sector_key(c.sector_id) || '/' || brain_path_label(c.id) || '/') collate "C",
         1
    from concepts c
   where c.parent_id is null
      or not exists (select 1 from concepts p where p.id = c.parent_id and p.user_id = c.user_id)
  union all
  select c.id, c.user_id, (t.path || brain_path_label(c.id) || '/') collate "C", t.depth + 1
    from concepts c
    join t on c.parent_id = t.id and c.user_id = t.user_id
   where t.depth < 512
)
update concepts c
   set path = t.path, depth = t.depth
  from t
 where c.id = t.id and c.user_id = t.user_id and c.path is null;

-- Anything still unreached sits in a legacy parent cycle: root it in its sector.
update concepts
   set path = ('/' || brain_sector_key(sector_id) || '/' || brain_path_label(id) || '/') collate "C",
       depth = 1
 where path is null;

-- ---------------------------------------------------------------------------
-- 2. One owning branch per memory
-- ---------------------------------------------------------------------------
alter table memories add column if not exists owner_branch_id text
  references concepts(id) on delete set null;
create index if not exists memories_owner_branch_idx on memories (user_id, owner_branch_id);

-- Deterministic owner: the earliest memory->concept link (by its synapse's
-- created_at), ties broken by concept id. Memories with no link stay null and
-- are visible only to a Full Brain grant.
update memories m
   set owner_branch_id = pick.concept_id
  from (
    select distinct on (mc.memory_id) mc.memory_id, mc.user_id, mc.concept_id
      from memory_concepts mc
      join concepts c on c.id = mc.concept_id and c.user_id = mc.user_id
      left join lateral (
        select min(k.created_at) as first_at
          from connections k
         where k.user_id = mc.user_id
           and k.source_type = 'memory' and k.source_id = mc.memory_id
           and k.target_type = 'concept' and k.target_id = mc.concept_id
      ) k on true
     order by mc.memory_id, k.first_at asc nulls last, mc.concept_id asc
  ) pick
 where pick.memory_id = m.id and pick.user_id = m.user_id and m.owner_branch_id is null;

-- New links bind an unowned memory to its first branch. An owner is never moved.
create or replace function memory_concepts_assign_owner() returns trigger
language plpgsql as $$
begin
  update memories
     set owner_branch_id = new.concept_id
   where id = new.memory_id and user_id = new.user_id and owner_branch_id is null
     and exists (select 1 from concepts c where c.id = new.concept_id and c.user_id = new.user_id);
  return null;
end $$;
drop trigger if exists memory_concepts_owner_ai on memory_concepts;
create trigger memory_concepts_owner_ai after insert on memory_concepts
  for each row execute function memory_concepts_assign_owner();

-- ---------------------------------------------------------------------------
-- 3. Connectors, grants, audit
-- ---------------------------------------------------------------------------
create table if not exists connectors (
  id              text primary key,
  user_id         text not null,
  kind            text not null default 'mcp_static' check (kind in ('mcp_static')),
  display_name    text not null,
  token_hash      text unique,
  token_prefix    text,
  status          text not null default 'active' check (status in ('active', 'revoked')),
  revoked_at      timestamptz,
  policy_version  integer not null default 1,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz,
  check ((status = 'revoked') = (revoked_at is not null)),
  check (token_hash is not null)
);
create index if not exists connectors_user_idx on connectors (user_id, status);

create table if not exists connector_grants (
  id               text primary key,
  user_id          text not null,
  connector_id     text not null references connectors(id) on delete cascade,
  scope_kind       text not null check (scope_kind in ('root', 'sector', 'branch')),
  sector_id        text,
  branch_id        text references concepts(id) on delete cascade,
  scope_path       text collate "C" not null,
  can_read         boolean not null default false,
  can_search       boolean not null default false,
  can_write_review boolean not null default false,
  can_write_direct boolean not null default false,
  can_execute      boolean not null default false,
  created_at       timestamptz not null default now(),
  revoked_at       timestamptz,
  check ((scope_kind = 'root'   and sector_id is null     and branch_id is null)
      or (scope_kind = 'sector' and sector_id is not null and branch_id is null)
      or (scope_kind = 'branch' and branch_id is not null and sector_id is null)),
  check (not can_search or can_read),
  check (not can_execute or can_read)
);
create index if not exists connector_grants_connector_idx on connector_grants (connector_id) where revoked_at is null;
create index if not exists connector_grants_user_idx on connector_grants (user_id) where revoked_at is null;

create table if not exists connector_audit_logs (
  seq              bigint generated always as identity primary key,
  id               text not null unique,
  user_id          text not null,
  connector_id     text not null,
  grant_id         text,
  action           text not null check (action in ('read', 'search', 'write_review', 'write_direct',
                     'execute', 'auth', 'revoke', 'grant_change', 'create')),
  tool_name        text,
  target_branch_id text,
  target_path      text,
  status           text not null check (status in ('allowed', 'denied', 'boundary_violation', 'error', 'pending_approval')),
  detail_json      jsonb not null default '{}',
  created_at       timestamptz not null default now(),
  prev_hash        text,
  row_hash         text not null default ''
);
create index if not exists connector_audit_user_time_idx on connector_audit_logs (user_id, seq desc);
create index if not exists connector_audit_connector_idx on connector_audit_logs (connector_id, seq desc);

-- Grant scope path: '/' for Full Brain, '/<sector>/' for a sector, the branch's path otherwise.
create or replace function connector_grants_set_scope() returns trigger
language plpgsql as $$
begin
  if new.scope_kind = 'root' then
    new.scope_path := '/';
  elsif new.scope_kind = 'sector' then
    new.scope_path := '/' || brain_sector_key(new.sector_id) || '/';
  else
    select c.path into new.scope_path
      from concepts c where c.id = new.branch_id and c.user_id = new.user_id;
    if new.scope_path is null then
      raise exception 'grant target branch not found' using errcode = 'foreign_key_violation';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists connector_grants_scope_biu on connector_grants;
create trigger connector_grants_scope_biu before insert or update of scope_kind, sector_id, branch_id
  on connector_grants for each row execute function connector_grants_set_scope();

-- Path maintenance: compute on insert / explicit move, reject moves into the own subtree.
create or replace function concepts_compute_path() returns trigger
language plpgsql as $$
declare
  p_path  text;
  p_depth integer;
begin
  if pg_trigger_depth() > 1 and new.path is not null then
    return new; -- the subtree rewrite below sets path and depth itself
  end if;
  if new.parent_id is not null then
    select c.path, c.depth into p_path, p_depth
      from concepts c where c.id = new.parent_id and c.user_id = new.user_id;
  end if;
  if p_path is null then
    new.path := ('/' || brain_sector_key(new.sector_id) || '/' || brain_path_label(new.id) || '/') collate "C";
    new.depth := 1;
  else
    if tg_op = 'UPDATE' and old.path is not null and starts_with(p_path, old.path) then
      raise exception 'A branch can''t be moved under itself or one of its children.'
        using errcode = 'check_violation';
    end if;
    new.path := (p_path || brain_path_label(new.id) || '/') collate "C";
    new.depth := coalesce(p_depth, 1) + 1;
  end if;
  return new;
end $$;
drop trigger if exists concepts_path_biu on concepts;
create trigger concepts_path_biu before insert or update of parent_id, sector_id on concepts
  for each row execute function concepts_compute_path();

-- After a row's path is set, rewrite its whole subtree (also adopts children that
-- were inserted before their parent, e.g. during a backup restore) and refresh
-- branch-grant scope paths, all in the same statement's transaction.
create or replace function concepts_repath_subtree() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.path is not distinct from old.path then
    return null;
  end if;
  with recursive t(id, path, depth) as (
    select c.id, (new.path || brain_path_label(c.id) || '/') collate "C", new.depth + 1
      from concepts c
     where c.user_id = new.user_id and c.parent_id = new.id and c.id <> new.id
    union all
    select c.id, (t.path || brain_path_label(c.id) || '/') collate "C", t.depth + 1
      from concepts c
      join t on c.parent_id = t.id
     where c.user_id = new.user_id and c.id <> new.id and t.depth < 512
  )
  update concepts c
     set path = t.path, depth = t.depth
    from t
   where c.id = t.id and c.user_id = new.user_id and c.path is distinct from t.path;
  update connector_grants g
     set scope_path = c.path
    from concepts c
   where g.scope_kind = 'branch' and g.branch_id = c.id
     and g.user_id = new.user_id and c.user_id = new.user_id
     and g.scope_path is distinct from c.path;
  return null;
end $$;
drop trigger if exists concepts_path_aiu on concepts;
create trigger concepts_path_aiu after insert or update of parent_id, sector_id on concepts
  for each row execute function concepts_repath_subtree();

-- Scope resolver: one row per active grant root for (user, connector, permission).
create or replace function connector_scope_paths(p_user text, p_connector text, p_perm text)
returns table (grant_id text, scope_kind text, scope_ref text, scope_path text, scope_end text)
language sql stable as $$
  select g.id,
         g.scope_kind,
         coalesce(g.branch_id, g.sector_id),
         g.scope_path,
         brain_path_end(g.scope_path)
    from connector_grants g
    join connectors k on k.id = g.connector_id
   where g.user_id = p_user
     and g.connector_id = p_connector
     and g.revoked_at is null
     and k.user_id = p_user
     and k.status = 'active'
     and case p_perm
           when 'read' then g.can_read
           when 'search' then g.can_search
           when 'write_review' then g.can_write_review
           when 'write_direct' then g.can_write_direct
           when 'execute' then g.can_execute
           else false
         end
$$;

-- Append-only, tamper-evident audit: each row hashes the previous row of the same user.
create or replace function connector_audit_chain() returns trigger
language plpgsql as $$
declare
  last_hash text;
begin
  perform pg_advisory_xact_lock(hashtext('connector_audit_logs:' || new.user_id));
  select a.row_hash into last_hash
    from connector_audit_logs a where a.user_id = new.user_id
   order by a.seq desc limit 1;
  new.prev_hash := last_hash;
  new.row_hash := encode(sha256(convert_to(
    coalesce(last_hash, '') || '|' || new.id || '|' || new.user_id || '|' || new.connector_id || '|' ||
    new.action || '|' || coalesce(new.tool_name, '') || '|' || coalesce(new.target_branch_id, '') || '|' ||
    coalesce(new.target_path, '') || '|' || new.status || '|' || new.detail_json::text || '|' ||
    to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), 'UTF8')), 'hex');
  return new;
end $$;
drop trigger if exists connector_audit_chain_bi on connector_audit_logs;
create trigger connector_audit_chain_bi before insert on connector_audit_logs
  for each row execute function connector_audit_chain();

create or replace function connector_audit_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'connector_audit_logs is append-only' using errcode = 'insufficient_privilege';
end $$;
drop trigger if exists connector_audit_no_update on connector_audit_logs;
create trigger connector_audit_no_update before update or delete on connector_audit_logs
  for each row execute function connector_audit_immutable();
drop trigger if exists connector_audit_no_truncate on connector_audit_logs;
create trigger connector_audit_no_truncate before truncate on connector_audit_logs
  for each statement execute function connector_audit_immutable();

-- ---------------------------------------------------------------------------
-- 4. pending_reviews provenance
-- ---------------------------------------------------------------------------
alter table pending_reviews add column if not exists connector_id text references connectors(id) on delete set null;
alter table pending_reviews add column if not exists grant_id text references connector_grants(id) on delete set null;
alter table pending_reviews add column if not exists target_branch_id text references concepts(id) on delete set null;
alter table pending_reviews add column if not exists source_kind text not null default 'voice';
alter table pending_reviews add column if not exists untrusted_payload_json jsonb;

-- ---------------------------------------------------------------------------
-- 5. Row-level security for the brain_connector role (defense in depth).
--    The app's own role owns these tables, so RLS never filters the app itself;
--    the connector endpoint switches to brain_connector per transaction when this
--    block succeeded. Any failure here (e.g. no CREATEROLE on the host) is caught,
--    rolled back to the block's savepoint and reported as a NOTICE.
-- ---------------------------------------------------------------------------
do $rls$
begin
  if not exists (select 1 from pg_roles where rolname = 'brain_connector') then
    create role brain_connector nologin;
  end if;
  execute format('grant brain_connector to %I', current_user);
  grant select on concepts, memories, connectors, connector_grants to brain_connector;
  grant select, insert on pending_reviews to brain_connector;
  grant execute on function connector_scope_paths(text, text, text), brain_path_end(text), brain_path_label(text),
    brain_sector_key(text)
    to brain_connector;

  alter table concepts enable row level security;
  alter table memories enable row level security;
  alter table pending_reviews enable row level security;

  -- Every other role keeps full visibility (the app's role owns the tables anyway).
  drop policy if exists concepts_not_connector on concepts;
  create policy concepts_not_connector on concepts using (current_user <> 'brain_connector')
    with check (current_user <> 'brain_connector');
  drop policy if exists memories_not_connector on memories;
  create policy memories_not_connector on memories using (current_user <> 'brain_connector')
    with check (current_user <> 'brain_connector');
  drop policy if exists pending_reviews_not_connector on pending_reviews;
  create policy pending_reviews_not_connector on pending_reviews using (current_user <> 'brain_connector')
    with check (current_user <> 'brain_connector');

  drop policy if exists concepts_connector_scope on concepts;
  create policy concepts_connector_scope on concepts for select to brain_connector using (
    user_id = current_setting('brain.user_id', true)
    and exists (
      select 1 from connector_scope_paths(current_setting('brain.user_id', true),
                                          current_setting('brain.connector_id', true), 'read') s
       where concepts.path >= s.scope_path collate "C" and concepts.path < s.scope_end collate "C"));

  drop policy if exists memories_connector_scope on memories;
  create policy memories_connector_scope on memories for select to brain_connector using (
    user_id = current_setting('brain.user_id', true)
    and (
      exists (
        select 1 from concepts c
          join connector_scope_paths(current_setting('brain.user_id', true),
                                     current_setting('brain.connector_id', true), 'read') s
            on c.path >= s.scope_path collate "C" and c.path < s.scope_end collate "C"
         where c.id = memories.owner_branch_id and c.user_id = memories.user_id)
      or (memories.owner_branch_id is null and exists (
        select 1 from connector_scope_paths(current_setting('brain.user_id', true),
                                            current_setting('brain.connector_id', true), 'read') s
         where s.scope_kind = 'root'))));

  drop policy if exists pending_reviews_connector_insert on pending_reviews;
  create policy pending_reviews_connector_insert on pending_reviews for insert to brain_connector with check (
    user_id = current_setting('brain.user_id', true)
    and connector_id = current_setting('brain.connector_id', true)
    and exists (
      select 1 from concepts c
        join connector_scope_paths(current_setting('brain.user_id', true),
                                   current_setting('brain.connector_id', true), 'write_review') s
          on c.path >= s.scope_path collate "C" and c.path < s.scope_end collate "C"
       where c.id = pending_reviews.target_branch_id and c.user_id = pending_reviews.user_id));
exception when others then
  raise notice 'brain_connector row-level security skipped: % (%)', sqlerrm, sqlstate;
end
$rls$;
