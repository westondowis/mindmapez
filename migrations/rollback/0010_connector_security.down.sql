-- Manual rollback for 0010_connector_security.sql. Not auto-applied (the
-- migrators only read migrations/*.sql). Drops the connector security layer and
-- the derived columns; no pre-existing data is touched.
do $rls$
begin
  drop policy if exists concepts_not_connector on concepts;
  drop policy if exists memories_not_connector on memories;
  drop policy if exists pending_reviews_not_connector on pending_reviews;
  drop policy if exists concepts_connector_scope on concepts;
  drop policy if exists memories_connector_scope on memories;
  drop policy if exists pending_reviews_connector_insert on pending_reviews;
  alter table concepts disable row level security;
  alter table memories disable row level security;
  alter table pending_reviews disable row level security;
  if exists (select 1 from pg_roles where rolname = 'brain_connector') then
    revoke all on concepts, memories, connectors, connector_grants, pending_reviews from brain_connector;
    revoke execute on function connector_scope_paths(text, text, text), brain_path_end(text), brain_path_label(text),
      brain_sector_key(text)
      from brain_connector;
    drop role brain_connector;
  end if;
exception when others then
  raise notice 'brain_connector cleanup skipped: % (%)', sqlerrm, sqlstate;
end
$rls$;

alter table pending_reviews drop column if exists untrusted_payload_json;
alter table pending_reviews drop column if exists source_kind;
alter table pending_reviews drop column if exists target_branch_id;
alter table pending_reviews drop column if exists grant_id;
alter table pending_reviews drop column if exists connector_id;

drop trigger if exists connector_audit_no_truncate on connector_audit_logs;
drop trigger if exists connector_audit_no_update on connector_audit_logs;
drop table if exists connector_audit_logs;
drop table if exists connector_grants;
drop table if exists connectors;
drop function if exists connector_audit_immutable();
drop function if exists connector_audit_chain();
drop function if exists connector_scope_paths(text, text, text);
drop function if exists connector_grants_set_scope();

drop trigger if exists memory_concepts_owner_ai on memory_concepts;
drop function if exists memory_concepts_assign_owner();
drop index if exists memories_owner_branch_idx;
alter table memories drop column if exists owner_branch_id;

drop trigger if exists concepts_path_aiu on concepts;
drop trigger if exists concepts_path_biu on concepts;
drop function if exists concepts_repath_subtree();
drop function if exists concepts_compute_path();
drop index if exists concepts_user_path_idx;
alter table concepts drop column if exists depth;
alter table concepts drop column if exists path;
drop function if exists brain_path_end(text);
drop function if exists brain_path_label(text);
drop function if exists brain_sector_key(text);

delete from _migrations where name = '0010_connector_security.sql';
