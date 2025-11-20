-- Seed demo timeline data for user d59b3467-0345-4459-99c7-6ae6d2871f41.
-- This migration only inserts chapter/entry rows; assumes the user already exists.

begin;

with chapter_payloads as (
  select * from (
    values
      (
        'Origins',
        'Family rituals, early curiosities, and the first sparks.',
        1,
        '[
          {
            "entry_type": "milestone",
            "title": "Backyard observatory",
            "summary": "Built a cardboard telescope with Dad.",
            "entry_date": "1991-08-12",
            "date_granularity": "day",
            "status": "published"
          },
          {
            "entry_type": "memory",
            "title": "Grandma''s journal",
            "summary": "Promised to record one question per day.",
            "entry_date": "1992-12-01",
            "date_granularity": "month",
            "status": "published"
          }
        ]'::jsonb
      ),
      (
        'School Days',
        'Learning to translate ideas into experiments and clubs.',
        2,
        '[
          {
            "entry_type": "milestone",
            "title": "Science fair win",
            "summary": "Project linking storytelling to memory retention.",
            "entry_date": "2003-03-15",
            "date_granularity": "day",
            "status": "published"
          },
          {
            "entry_type": "story",
            "title": "Lunch radio club",
            "summary": "Interviewed classmates about turning points.",
            "entry_date": "2005-10-01",
            "date_granularity": "month",
            "status": "draft"
          }
        ]'::jsonb
      )
  ) as payload(title, description, position, entries)
),
inserted_chapters as (
  insert into public.user_chapters (id, user_id, title, description, position)
  select
    gen_random_uuid(),
    'd59b3467-0345-4459-99c7-6ae6d2871f41',
    title,
    description,
    position
  from chapter_payloads
  returning id, title
)
insert into public.chapter_entries (
  chapter_id,
  entry_type,
  title,
  summary,
  entry_date,
  date_granularity,
  status
)
select
  ic.id,
  (entry->>'entry_type')::public.chapter_entry_type,
  entry->>'title',
  entry->>'summary',
  nullif(entry->>'entry_date', '')::date,
  coalesce((entry->>'date_granularity')::public.chapter_entry_date_granularity, 'day'),
  coalesce((entry->>'status')::public.chapter_entry_status, 'draft')
from inserted_chapters ic
join chapter_payloads cp on cp.title = ic.title
cross join lateral jsonb_array_elements(cp.entries) as entry
on conflict do nothing;

commit;
