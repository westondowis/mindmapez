-- Move older topic sectors onto anatomical brain regions.
update concepts set sector_id = 'frontal' where sector_id = 'ideas';
update concepts set sector_id = 'parietal' where sector_id in ('goals', 'learning');
update concepts set sector_id = 'temporal' where sector_id in ('strategy', 'creativity');
update concepts set sector_id = 'occipital' where sector_id = 'growth';
update concepts set sector_id = 'cerebellum' where sector_id = 'action';
update concepts set sector_id = 'brainstem' where sector_id = 'insights';
