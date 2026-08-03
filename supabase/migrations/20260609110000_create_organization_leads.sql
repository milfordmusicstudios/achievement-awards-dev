create table if not exists public.organization_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  studio_name text not null,
  contact_name text not null,
  email text not null,
  phone text,
  organization_type text,
  student_count text,
  teacher_count integer,
  current_software text,
  goals text[] not null default '{}'::text[],
  notes text,
  lead_type text not null,
  status text not null default 'new',
  source text not null default 'organization_pricing_page',
  constraint organization_leads_lead_type_check check (lead_type in ('information', 'demo')),
  constraint organization_leads_status_check check (status in ('new', 'contacted', 'qualified', 'closed', 'archived')),
  constraint organization_leads_source_check check (source <> ''),
  constraint organization_leads_teacher_count_check check (teacher_count is null or teacher_count >= 0)
);

alter table public.organization_leads enable row level security;

create index if not exists organization_leads_created_at_idx
  on public.organization_leads (created_at desc);

create index if not exists organization_leads_status_idx
  on public.organization_leads (status);

create index if not exists organization_leads_email_idx
  on public.organization_leads (lower(email));
