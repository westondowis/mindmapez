-- Manual rollback for 0016_multimodal_memories.sql (not auto-applied).
-- Viewer state (checklists, mini-app storage) and extracted metadata are dropped; bodies/media stay.
alter table memories drop column if exists content_length;
alter table memories drop constraint if exists memories_thumb_size;
alter table memories drop constraint if exists memories_extracted_size;
alter table memories drop constraint if exists memories_artifact_state_size;
alter table memories drop constraint if exists memories_viewer_type_check;
alter table memories drop column if exists thumb_data_url;
alter table memories drop column if exists extracted_metadata_json;
alter table memories drop column if exists artifact_saved_at;
alter table memories drop column if exists artifact_state_json;
alter table memories drop column if exists viewer_type;
delete from _migrations where name = '0016_multimodal_memories.sql';
