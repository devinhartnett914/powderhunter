-- 005_clubmed_allinclusive.sql
-- Club Med is all-inclusive: kids ski free and ski school are included in the package price.

UPDATE resorts
SET kids_ski_free = 'Included',
    ski_school_max_cost = 0
WHERE pass_type = 'Club Med';
