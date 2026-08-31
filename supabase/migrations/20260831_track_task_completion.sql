alter table tasks
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by_user_id uuid references users(id),
  add column if not exists completed_by_name text;

create index if not exists tasks_completed_by_user_id_idx
  on tasks(completed_by_user_id);

update tasks
set completed_at = coalesce(updated_at, created_at)
where status = 'completed' and completed_at is null;
