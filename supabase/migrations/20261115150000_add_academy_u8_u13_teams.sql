-- Add academy age groups U13, U12, U11, U10, U9, U8 for ФК Чорноморець (idempotent)
INSERT INTO public.teams (club_id, name, category, sort_order)
SELECT '00000000-0000-0000-0000-000000000001', v.name, 'academy'::team_category, v.sort_order
FROM (
  VALUES
    ('U13', 7),
    ('U12', 8),
    ('U11', 9),
    ('U10', 10),
    ('U9', 11),
    ('U8', 12)
) AS v(name, sort_order)
WHERE EXISTS (
  SELECT 1 FROM public.clubs WHERE id = '00000000-0000-0000-0000-000000000001'
)
AND NOT EXISTS (
  SELECT 1 FROM public.teams t
  WHERE t.club_id = '00000000-0000-0000-0000-000000000001'
    AND UPPER(t.name) = v.name
);
