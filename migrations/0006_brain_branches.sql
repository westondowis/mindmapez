-- Nested mind-map branches live on concepts: parent_id + visual sector_id.
-- Existing rows stay; categories become primary branches, other concepts nest
-- under a connected category when we can infer one.

alter table concepts add column if not exists parent_id text;
alter table concepts add column if not exists sector_id text;
alter table concepts add column if not exists description text not null default '';
alter table concepts add column if not exists updated_at timestamptz not null default now();

create index if not exists concepts_parent_idx on concepts (user_id, parent_id);
create index if not exists concepts_sector_idx on concepts (user_id, sector_id);

-- Same name may exist under different parents.
drop index if exists concepts_user_name_idx;
create index if not exists concepts_user_name_lookup_idx on concepts (user_id, name);

-- Keyword sector assignment for existing maps.
update concepts set sector_id = 'ideas'
  where sector_id is null and lower(name) similar to '%(idea|mindset|creat|inspir)%';
update concepts set sector_id = 'goals'
  where sector_id is null and lower(name) similar to '%(goal|vision|ambition|dream)%';
update concepts set sector_id = 'strategy'
  where sector_id is null and lower(name) similar to '%(strateg|business|real estate|plan|negotiat)%';
update concepts set sector_id = 'growth'
  where sector_id is null and lower(name) similar to '%(growth|health|fitness|progress|scale)%';
update concepts set sector_id = 'action'
  where sector_id is null and lower(name) similar to '%(action|golf|travel|execut|habit)%';
update concepts set sector_id = 'learning'
  where sector_id is null and lower(name) similar to '%(learn|prep|lesson|study|skill)%';
update concepts set sector_id = 'insights'
  where sector_id is null and lower(name) similar to '%(insight|financ|tax|data|pattern)%';
update concepts set sector_id = 'creativity'
  where sector_id is null and lower(name) similar to '%(famil|relationship|people|love|express)%';

update concepts
set sector_id = (array['ideas','goals','strategy','growth','action','learning','insights','creativity'])[
  (ascii(substring(lower(coalesce(name, 'm')) from 1 for 1)) % 8) + 1
]
where sector_id is null;

-- Nest non-category concepts under a connected category.
update concepts child
set parent_id = x.source_id
from connections x
join concepts parent on parent.id = x.source_id and parent.user_id = x.user_id
where child.id = x.target_id
  and child.user_id = x.user_id
  and x.source_type = 'concept'
  and x.target_type = 'concept'
  and x.status = 'accepted'
  and child.kind <> 'category'
  and parent.kind = 'category'
  and child.parent_id is null;

update concepts child
set parent_id = x.target_id
from connections x
join concepts parent on parent.id = x.target_id and parent.user_id = x.user_id
where child.id = x.source_id
  and child.user_id = x.user_id
  and x.source_type = 'concept'
  and x.target_type = 'concept'
  and x.status = 'accepted'
  and child.kind <> 'category'
  and parent.kind = 'category'
  and child.parent_id is null;

-- Children inherit the parent's sector so a tree stays in one region.
update concepts child
set sector_id = parent.sector_id
from concepts parent
where child.parent_id = parent.id
  and parent.sector_id is not null;
