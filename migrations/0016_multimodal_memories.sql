-- v5.35 multimodal memories + lightweight graph.
-- viewer_type picks the adaptive viewer; artifact_state_json holds user-editable viewer state
-- (HTML mini-app storage, checklist items, reader position); extracted_metadata_json holds parsed
-- facts (transcript segments, outline, VEVENTs, geo features...). thumb_data_url is a tiny preview
-- that the graph may load; content_length keeps synapse scaling without shipping body/transcript.
-- Every viewer value for v5.35-v5.37 is listed up front, so later phases need no migration.
alter table memories add column if not exists viewer_type text not null default 'plain';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'memories_viewer_type_check') then
    alter table memories add constraint memories_viewer_type_check check (viewer_type in (
      'plain','dataset','html_app','structured_tree','svg_viewer','image','interactive_checklist',
      'media','document_reader','calendar_event','contacts_crm','email_thread','geo_map',
      'archive_tree','file'));
  end if;
end $$;

alter table memories add column if not exists artifact_state_json jsonb not null default '{}'::jsonb;
alter table memories add column if not exists artifact_saved_at timestamptz;
alter table memories add column if not exists extracted_metadata_json jsonb not null default '{}'::jsonb;
alter table memories add column if not exists thumb_data_url text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'memories_artifact_state_size') then
    alter table memories add constraint memories_artifact_state_size
      check (octet_length(artifact_state_json::text) <= 262144);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'memories_extracted_size') then
    alter table memories add constraint memories_extracted_size
      check (octet_length(extracted_metadata_json::text) <= 1048576);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'memories_thumb_size') then
    alter table memories add constraint memories_thumb_size
      check (thumb_data_url is null or (length(thumb_data_url) <= 24000 and thumb_data_url like 'data:image/%'));
  end if;
end $$;

-- Computed once per write; the graph reads this integer instead of title+body+transcript.
alter table memories add column if not exists content_length integer
  generated always as (coalesce(length(title), 0) + coalesce(length(body), 0) + coalesce(length(transcript), 0)) stored;

-- Existing rows get the viewer that matches what they already hold.
update memories set viewer_type = case
    when media_mime like 'image/%' then 'image'
    when media_mime like 'audio/%' or media_mime like 'video/%' then 'media'
    when media_url is not null then 'file'
    else 'plain'
  end
where viewer_type = 'plain';
