-- Ensure deal stages referenced by the application exist.
-- These inserts are name-based so they preserve existing stage IDs and deals.

insert into public.deal_stages (name, type, sort_order, is_default, is_demo)
select 'Request for Information', 'lead', 1, true, false
where not exists (
  select 1 from public.deal_stages where lower(name) = 'request for information'
);

insert into public.deal_stages (name, type, sort_order, is_default, is_demo)
select 'Contacted', 'lead', 2, false, false
where not exists (
  select 1 from public.deal_stages where lower(name) = 'contacted'
);

insert into public.deal_stages (name, type, sort_order, is_default, is_demo)
select 'Appointment Set', 'consultation', 3, false, false
where not exists (
  select 1 from public.deal_stages where lower(name) = 'appointment set'
);

insert into public.deal_stages (name, type, sort_order, is_default, is_demo)
select 'Consultation Scheduled', 'consultation', 4, false, false
where not exists (
  select 1 from public.deal_stages where lower(name) = 'consultation scheduled'
);

insert into public.deal_stages (name, type, sort_order, is_default, is_demo)
select 'Consultation Complete', 'consultation', 5, false, false
where not exists (
  select 1 from public.deal_stages where lower(name) = 'consultation complete'
);

insert into public.deal_stages (name, type, sort_order, is_default, is_demo)
select 'Quote Sent', 'consultation', 6, false, false
where not exists (
  select 1 from public.deal_stages where lower(name) = 'quote sent'
);

insert into public.deal_stages (name, type, sort_order, is_default, is_demo)
select 'Operation Scheduled', 'surgery', 7, false, false
where not exists (
  select 1 from public.deal_stages where lower(name) = 'operation scheduled'
);

insert into public.deal_stages (name, type, sort_order, is_default, is_demo)
select 'Surgery Scheduled', 'surgery', 8, false, false
where not exists (
  select 1 from public.deal_stages where lower(name) = 'surgery scheduled'
);

insert into public.deal_stages (name, type, sort_order, is_default, is_demo)
select 'Surgery Complete', 'surgery', 9, false, false
where not exists (
  select 1 from public.deal_stages where lower(name) = 'surgery complete'
);

insert into public.deal_stages (name, type, sort_order, is_default, is_demo)
select 'Post-Op Care', 'post_op', 10, false, false
where not exists (
  select 1 from public.deal_stages where lower(name) = 'post-op care'
);

insert into public.deal_stages (name, type, sort_order, is_default, is_demo)
select 'Follow-Up', 'follow_up', 11, false, false
where not exists (
  select 1 from public.deal_stages where lower(name) = 'follow-up'
);

insert into public.deal_stages (name, type, sort_order, is_default, is_demo)
select 'Closed Won', 'other', 12, false, false
where not exists (
  select 1 from public.deal_stages where lower(name) = 'closed won'
);

insert into public.deal_stages (name, type, sort_order, is_default, is_demo)
select 'Closed Lost', 'other', 13, false, false
where not exists (
  select 1 from public.deal_stages where lower(name) = 'closed lost'
);

insert into public.deal_stages (name, type, sort_order, is_default, is_demo)
select 'Abandoned / Unanswered', 'other', 14, false, false
where not exists (
  select 1 from public.deal_stages where lower(name) = 'abandoned / unanswered'
);

-- Normalize default stage flags so lead intake and booking fallbacks agree.
update public.deal_stages
set is_default = lower(name) = 'request for information'
where lower(name) in (
  'request for information',
  'new lead',
  'contacted',
  'appointment set',
  'consultation scheduled',
  'consultation complete',
  'quote sent',
  'operation scheduled',
  'surgery scheduled',
  'surgery complete',
  'post-op care',
  'follow-up',
  'closed won',
  'closed lost',
  'abandoned / unanswered'
);
