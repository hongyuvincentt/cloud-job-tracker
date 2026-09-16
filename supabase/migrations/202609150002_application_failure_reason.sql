alter table public.applications
  add column if not exists failure_reason text not null default '';

comment on column public.applications.failure_reason is
  'Required by the client when next_action is 投递失败; otherwise stored as an empty string.';
