-- Deal notifications for tracking deal stage changes and events
-- Required by HeaderDealNotificationsButton

create table if not exists deal_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  notification_type text not null check (notification_type in ('stage_changed', 'deal_created', 'deal_assigned', 'deal_updated')),
  old_stage_id uuid references deal_stages(id) on delete set null,
  new_stage_id uuid references deal_stages(id) on delete set null,
  old_stage_name text,
  new_stage_name text,
  changed_by_user_id uuid references users(id) on delete set null,
  changed_by_name text,
  read_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists deal_notifications_user_id_idx on deal_notifications(user_id);
create index if not exists deal_notifications_deal_id_idx on deal_notifications(deal_id);
create index if not exists deal_notifications_read_at_idx on deal_notifications(read_at);
create index if not exists deal_notifications_created_at_idx on deal_notifications(created_at desc);
