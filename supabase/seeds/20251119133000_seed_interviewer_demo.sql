-- Seed example interviews, messages, and linked entries for the demo user.
-- Optional demo data only. This assumes the auth user and matching chapter data already exist.

begin;

with first_chapter as (
  select id
  from public.user_chapters
  where user_id = 'd59b3467-0345-4459-99c7-6ae6d2871f41'
  order by position asc, created_at asc
  limit 1
),
insert_interviews as (
  insert into public.user_interviews (id, user_id, name, status, created_at, closed_at)
  values
    (
      '35ce5b01-4545-456c-b3d7-26f5bf0c1e01',
      'd59b3467-0345-4459-99c7-6ae6d2871f41',
      'Career pivots with Dad',
      'in_progress',
      '2025-05-15T14:00:00Z',
      null
    ),
    (
      '35ce5b01-4545-456c-b3d7-26f5bf0c1e02',
      'd59b3467-0345-4459-99c7-6ae6d2871f41',
      'School days recap',
      'closed',
      '2025-05-10T18:00:00Z',
      '2025-05-10T19:00:00Z'
    )
  on conflict (id) do nothing
  returning id
),
insert_entries as (
  insert into public.chapter_entries (
    id,
    chapter_id,
    entry_type,
    title,
    summary,
    entry_date,
    date_granularity,
    status
  )
  select
    payload.entry_id::uuid,
    fc.id,
    payload.entry_type::public.chapter_entry_type,
    payload.title,
    payload.summary,
    payload.entry_date::date,
    payload.date_granularity::public.chapter_entry_date_granularity,
    'draft'::public.chapter_entry_status
  from first_chapter fc
  cross join (
    values
      (
        '6c8d6a4d-1dd1-4a45-8338-5b14cdee7001',
        'story',
        'Career pivots with Dad',
        'Seeded entry created from the AI interviewer demo.',
        '1998-05-01',
        'month'
      ),
      (
        '6c8d6a4d-1dd1-4a45-8338-5b14cdee7002',
        'memory',
        'School days recap',
        'Highlights captured while testing the chat workflow.',
        '1999-04-01',
        'month'
      )
  ) as payload(entry_id, entry_type, title, summary, entry_date, date_granularity)
  on conflict (id) do nothing
  returning id, title
)
insert into public.interview_entries (interview_id, entry_id)
select '35ce5b01-4545-456c-b3d7-26f5bf0c1e01'::uuid, id
from insert_entries
where title = 'Career pivots with Dad'
union all
select '35ce5b01-4545-456c-b3d7-26f5bf0c1e02'::uuid, id
from insert_entries
where title = 'School days recap'
on conflict do nothing;

insert into public.interview_messages (interview_id, author, ts, body)
values
  (
    '35ce5b01-4545-456c-b3d7-26f5bf0c1e01',
    'interviewer',
    '2025-05-15T14:00:00Z',
    'Welcome back! Ready to keep exploring your career pivots with Dad?'
  ),
  (
    '35ce5b01-4545-456c-b3d7-26f5bf0c1e01',
    'user',
    '2025-05-15T14:01:00Z',
    'Yes, that conversation still feels vivid.'
  ),
  (
    '35ce5b01-4545-456c-b3d7-26f5bf0c1e01',
    'interviewer',
    '2025-05-15T14:02:00Z',
    'What detail stands out most from that season?'
  ),
  (
    '35ce5b01-4545-456c-b3d7-26f5bf0c1e01',
    'user',
    '2025-05-15T14:03:00Z',
    'How Dad asked questions on every drive to school.'
  ),
  (
    '35ce5b01-4545-456c-b3d7-26f5bf0c1e02',
    'interviewer',
    '2025-05-10T18:00:00Z',
    'Let’s recap a favorite school day moment.'
  ),
  (
    '35ce5b01-4545-456c-b3d7-26f5bf0c1e02',
    'user',
    '2025-05-10T18:01:30Z',
    'Winning the science fair felt electric. Add new entry so I do not forget.'
  ),
  (
    '35ce5b01-4545-456c-b3d7-26f5bf0c1e02',
    'interviewer',
    '2025-05-10T18:02:00Z',
    'Noted! I captured that win as an entry for you to revisit later.'
  )
on conflict do nothing;

commit;
