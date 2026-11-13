-- Outbound app hub + browser bridge (v5.29). Additive and idempotent.
--
-- 1. connector_grants: which provider apps (toolkit slugs) and which browser
--    domains a grant's `execute` flag may reach. Empty means none.
-- 2. pending_actions: every outbound action a connector proposes waits here
--    for the owner's approval before anything runs.
-- 3. connector_audit_logs: new action kinds for the hub.

alter table connector_grants add column if not exists allowed_apps text[] not null default '{}';
alter table connector_grants add column if not exists allowed_domains text[] not null default '{}';

create table if not exists pending_actions (
  id                   text primary key,
  user_id              text not null,
  connector_id         text not null references connectors(id) on delete cascade,
  grant_id             text references connector_grants(id) on delete set null,
  kind                 text not null check (kind in ('app', 'browser')),
  provider             text,
  app_slug             text,
  action_slug          text,
  connected_account_id text,
  arguments_json       jsonb not null default '{}',
  context_memory_ids   text[] not null default '{}',
  target_domain        text,
  target_url           text,
  browser_action       text check (browser_action is null or browser_action in ('navigate', 'read', 'click', 'type', 'submit')),
  summary              text not null default '',
  status               text not null default 'pending'
                       check (status in ('pending', 'approved', 'rejected', 'claimed', 'executed', 'failed', 'expired')),
  result_json          jsonb,
  error                text,
  created_at           timestamptz not null default now(),
  decided_at           timestamptz,
  executed_at          timestamptz,
  check ((kind = 'app' and app_slug is not null and action_slug is not null and browser_action is null)
      or (kind = 'browser' and target_domain is not null and browser_action is not null))
);
create index if not exists pending_actions_user_status_idx on pending_actions (user_id, status, created_at desc);
create index if not exists pending_actions_connector_idx on pending_actions (connector_id, status, created_at);

alter table connector_audit_logs drop constraint if exists connector_audit_logs_action_check;
alter table connector_audit_logs add constraint connector_audit_logs_action_check check (action in (
  'read', 'search', 'write_review', 'write_direct', 'execute', 'auth', 'revoke', 'grant_change', 'create',
  'propose', 'approve', 'reject', 'claim', 'app_connect', 'app_disconnect'));
