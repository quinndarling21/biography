begin;

alter table public.interview_messages
add column if not exists metadata jsonb;

comment on column public.interview_messages.metadata is
  'Structured UI metadata for an interview message, such as linked entry actions.';

commit;
