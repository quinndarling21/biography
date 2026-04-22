-- Capture per-message LLM payloads for admin debugging.

begin;

create table if not exists public.interview_message_debug_logs (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.user_interviews (id) on delete cascade,
  interview_message_id uuid not null references public.interview_messages (id) on delete cascade,
  request_payload jsonb not null,
  response_payload jsonb not null,
  metadata jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint interview_message_debug_logs_message_unique unique (interview_message_id)
);

comment on table public.interview_message_debug_logs is
  'Stores raw LLM prompts/responses to help admins troubleshoot conversations.';

create index if not exists interview_debug_logs_message_idx
  on public.interview_message_debug_logs (interview_message_id);

create index if not exists interview_debug_logs_interview_idx
  on public.interview_message_debug_logs (interview_id, created_at);

alter table public.interview_message_debug_logs enable row level security;

create policy "Admins record debug logs for their interviews"
  on public.interview_message_debug_logs
  for insert
  with check (
    exists (
      select 1
      from public.user_interviews ui
      where ui.id = interview_message_debug_logs.interview_id
        and ui.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.is_admin
    )
  );

create policy "Admins view debug logs for their interviews"
  on public.interview_message_debug_logs
  for select
  using (
    exists (
      select 1
      from public.user_interviews ui
      where ui.id = interview_message_debug_logs.interview_id
        and ui.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.is_admin
    )
  );

commit;
