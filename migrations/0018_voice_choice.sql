-- Preferred spoken voice ("female" | "male"), kept per account so it survives reloads and devices.
alter table user_settings add column if not exists voice_choice text not null default 'female';
