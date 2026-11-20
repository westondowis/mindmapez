-- Custom emojis (v5.33). Additive and idempotent. Reverse with
-- migrations/rollback/0014_custom_emojis.down.sql (not auto-applied).
--
-- A user's own emoji-style icons, made by typing a description (generated) or
-- sketching (drawn). The svg column holds markup already passed through the
-- app's SVG whitelist sanitizer (src/lib/custom-emoji.ts). A branch, sector or
-- memory points at one by storing the token `custom:<id>` in its existing
-- emoji text field, so no other table changes. Not granted to brain_connector.

create table if not exists custom_emojis (
  id          text primary key,
  user_id     text not null,
  label       text not null default '' check (length(label) <= 60),
  svg         text not null check (length(svg) between 20 and 24000),
  source      text not null check (source in ('generated', 'drawn')),
  created_at  timestamptz not null default now()
);
create index if not exists custom_emojis_user_idx on custom_emojis (user_id, created_at desc);
