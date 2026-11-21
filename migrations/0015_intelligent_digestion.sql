-- v5.35 intelligent data digestion: tabular uploads (csv/tsv/json/xlsx/vcf) become a dataset memory
-- whose rows live here instead of being truncated into memories.body. Additive and idempotent.
-- Connectors get NO grant on these tables (summary-only, fail-closed): they only ever see the
-- dataset memory's markdown summary through the existing memories scope.

-- pg_trgm accelerates row search. Wrapped so a host without the extension still migrates;
-- search then falls back to a plain ILIKE scan within one dataset.
do $$
begin
  create extension if not exists pg_trgm;
exception when others then
  raise notice 'pg_trgm unavailable (%); dataset row search will use sequential ILIKE', sqlerrm;
end $$;

create table if not exists digested_datasets (
  id                   text primary key,
  user_id              text not null,
  memory_id            text not null references memories(id) on delete cascade,
  concept_id           text references concepts(id) on delete set null,
  archetype            text not null check (archetype in ('contacts_crm','invoice_ledger',
                         'real_estate_parcels','financial_statement','communication_log','generic_table')),
  status               text not null default 'ingesting' check (status in ('ingesting','ready','failed')),
  source_filename      text not null default '',
  source_format        text not null check (source_format in ('csv','tsv','json','xlsx','vcf')),
  row_count            integer not null default 0 check (row_count >= 0 and row_count <= 100000),
  expected_rows        integer not null default 0,
  schema_json          jsonb not null default '{}'::jsonb,
  summary_metrics_json jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index if not exists digested_datasets_memory_idx on digested_datasets (memory_id);
create index if not exists digested_datasets_user_idx on digested_datasets (user_id, created_at desc);

create table if not exists digested_rows (
  dataset_id          text not null references digested_datasets(id) on delete cascade,
  row_index           integer not null check (row_index >= 0 and row_index < 100000),
  user_id             text not null,
  canonical_json      jsonb not null default '{}'::jsonb,
  custom_fields_json  jsonb not null default '{}'::jsonb,
  search_text         text not null default '' check (length(search_text) <= 4096),
  primary key (dataset_id, row_index)
);
create index if not exists digested_rows_user_idx on digested_rows (user_id, dataset_id);
create index if not exists digested_rows_canon_idx on digested_rows using gin (canonical_json jsonb_path_ops);

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute 'create index if not exists digested_rows_trgm_idx on digested_rows using gin (search_text gin_trgm_ops)';
  end if;
end $$;
