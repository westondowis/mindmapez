alter table user_settings add column if not exists display_name text;
alter table user_settings add column if not exists age integer;
alter table user_settings add column if not exists onboarded boolean not null default false;

alter table concepts add column if not exists emoji text;
alter table concepts add column if not exists color text;

alter table memories add column if not exists emoji text;
alter table memories add column if not exists color text;

-- Existing demo meshes already have sample data — skip the walkthrough.
update user_settings set onboarded = true where seeded = true and onboarded = false;
