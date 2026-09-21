-- EMAIL-012: Newsletter scheduling — record when a campaign was scheduled for.
alter table marketing_campaigns
  add column if not exists scheduled_at timestamptz;
