## Backfill Job Poster Names

If some existing `jobs.metadata.poster_name` values are emails, you can backfill them from `profiles.full_name` where available.

Run this SQL in Supabase SQL editor (ensure RLS allows the admin role or disable RLS temporarily for the migration):

```sql
-- Update poster_name when it looks like an email and we have a matching profile name
update jobs j
set metadata = jsonb_set(j.metadata, '{poster_name}', to_jsonb(p.full_name))
from profiles p
where (j.metadata->>'poster_name') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  and p.id = j.author_id
  and coalesce(p.full_name, p.display_name) is not null;
```

Optionally, if you want to keep poster email separate but ensure name present:

```sql
update jobs j
set metadata = jsonb_set(
  jsonb_set(j.metadata, '{poster_name}', to_jsonb(coalesce(p.full_name, p.display_name))),
  '{poster_email}', to_jsonb(coalesce(j.metadata->>'poster_email', j.metadata->>'poster_name'))
)
from profiles p
where (j.metadata->>'poster_name') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  and p.id = j.author_id;
```

Review a few rows first:

```sql
select j.id, j.metadata->>'poster_name' as before_name, p.full_name
from jobs j
left join profiles p on p.id = j.author_id
where (j.metadata->>'poster_name') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
limit 20;
```

Supabase Migration Notes

This file lists example SQL to create the basic tables used by the DIU Forum frontend.
Run these in Supabase SQL Editor (or via `supabase` CLI) in your project database.

-- 1) posts table
CREATE TABLE public.posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  heading text,
  content text NOT NULL,
  media jsonb,
  posted_at timestamptz DEFAULT now(),
  author_id uuid,
  author_name text,
  author_photo text,
  role text,
  department text,
  institution text,
  contacts jsonb
);

-- 2) jobs table
CREATE TABLE public.jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text,
  company text,
  location text,
  job_type text,
  department text,
  description text,
  required_skills text,
  application_url text,
  poster_id uuid,
  poster_name text,
  posted_at timestamptz DEFAULT now()
);

-- 3) education_opportunities table
CREATE TABLE public.education_opportunities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text,
  university text,
  country text,
  opportunity_type text,
  funding text,
  deadline date,
  description text,
  requirements text,
  application_url text,
  poster_id uuid,
  poster_name text,
  posted_at timestamptz DEFAULT now()
);

-- 4) comments table
CREATE TABLE public.comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  author_id uuid,
  author_name text,
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 5) post_likes table
CREATE TABLE public.post_likes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE (post_id, user_id)
);

-- Notes:
- Consider enabling Row Level Security and creating policies for authenticated inserts/selects.
- If you want realtime INSERT events to reach the client, enable realtime on the tables in the Supabase Dashboard.
- Add extra indexes on columns you will filter/order by (e.g., posted_at).

---

## Saved Items RPCs (bypass RLS for saves)

To persist Save/Unsave actions across devices while keeping RLS on `saved_items`, create SECURITY DEFINER functions and grant execute to `authenticated`:

```sql
-- saved_items table (if not already present)
create table if not exists public.saved_items (
  id uuid default gen_random_uuid() primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null,
  item_type text not null,
  created_at timestamptz default now(),
  unique (profile_id, item_id, item_type)
);

-- Upsert (Save) via RPC
create or replace function public.saved_items_upsert(p_profile_id uuid, p_item_id text, p_item_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.saved_items (profile_id, item_id, item_type)
  values (p_profile_id, p_item_id, p_item_type)
  on conflict (profile_id, item_id, item_type) do nothing;
end;
$$;

-- Delete (Unsave) via RPC
create or replace function public.saved_items_delete(p_profile_id uuid, p_item_id text, p_item_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.saved_items
  where profile_id = p_profile_id and item_id = p_item_id and item_type = p_item_type;
end;
$$;

-- Grants for client access
grant execute on function public.saved_items_upsert(uuid, text, text) to authenticated;
grant execute on function public.saved_items_delete(uuid, text, text) to authenticated;
```

After deploying these, the frontend can call `rpc('saved_items_upsert', ...)` and `rpc('saved_items_delete', ...)` to persist saves under RLS safely.

### RLS Policies for `saved_items`

If you prefer direct table writes from the client instead of RPCs, enable RLS and add policies that allow users to manage their own rows based on `profiles.auth_id`:

```sql
alter table public.saved_items enable row level security;

-- Helper index to speed up lookups
create index if not exists saved_items_profile_item_idx on public.saved_items(profile_id, item_id, item_type);

-- Select only own saved items
create policy saved_items_select_own
on public.saved_items
for select
to authenticated
using (
  profile_id = (select p.id from public.profiles p where p.auth_id = auth.uid())
);

-- Insert (save) only for own profile
create policy saved_items_insert_own
on public.saved_items
for insert
to authenticated
with check (
  profile_id = (select p.id from public.profiles p where p.auth_id = auth.uid())
);

-- Delete (unsave) only own rows
create policy saved_items_delete_own
on public.saved_items
for delete
to authenticated
using (
  profile_id = (select p.id from public.profiles p where p.auth_id = auth.uid())
);
```

With these policies, the existing `.from('saved_items')` upsert/delete calls will work for the signed-in user without RPCs.

---

## Reports Table (Content Moderation)

Create a table to store user-submitted reports for inappropriate or problematic content:

```sql
-- Reports table for content moderation
create table if not exists public.reports (
  id uuid not null default gen_random_uuid(),
  item_id uuid not null,
  item_type text not null,
  reason text not null,
  reporter_id uuid,
  reporter_email text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_by text,
  resolved_at timestamptz,
  notes text,
  constraint reports_pkey primary key (id),
  constraint reports_reporter_id_fkey foreign key (reporter_id) references public.profiles (id) on delete set null,
  constraint reports_item_type_check check (
    item_type = any (array['post'::text, 'job'::text, 'study'::text])
  ),
  constraint reports_status_check check (
    status = any (array['pending'::text, 'reviewed'::text, 'resolved'::text, 'dismissed'::text])
  )
);

-- Indexes for efficient querying
create index if not exists reports_item_idx on public.reports (item_id, item_type);
create index if not exists reports_status_idx on public.reports (status);
create index if not exists reports_reporter_idx on public.reports (reporter_id);
create index if not exists reports_created_at_idx on public.reports (created_at desc);

-- Enable RLS
alter table public.reports enable row level security;

-- Allow authenticated users to submit reports
create policy reports_insert_authenticated
on public.reports
for insert
to authenticated
with check (true);

-- Allow authenticated users to view their own reports
create policy reports_select_own
on public.reports
for select
to authenticated
using (
  reporter_id = (select p.id from public.profiles p where p.auth_id = auth.uid())
);

-- Note: Admin access to all reports should be handled via service role key or SECURITY DEFINER functions
```

This table enables users to report problematic content, which admins can then review and take action on via the admin panel.

---

## Lost & Found System

### Tables

Run this SQL to create the Lost & Found tables, views, and RPCs:

```sql
-- 1) lost_found_items table
create table if not exists public.lost_found_items (
  id uuid default gen_random_uuid() primary key,
  item_name text not null,
  description text not null,
  phone_number text not null,
  date_found date not null,
  place_found text not null,
  time_found time,
  author_id uuid not null,
  handed_over boolean not null default false,
  handed_over_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lost_found_items_author_id_fkey foreign key (author_id) references public.profiles (id) on delete cascade
);

-- Indexes
create index if not exists lost_found_items_author_id_idx on public.lost_found_items (author_id);
create index if not exists lost_found_items_handed_over_idx on public.lost_found_items (handed_over);
create index if not exists lost_found_items_created_at_idx on public.lost_found_items (created_at desc);

-- Enable RLS
alter table public.lost_found_items enable row level security;

-- RLS Policies
create policy lost_found_items_select_all
on public.lost_found_items
for select
to authenticated
using (true);

create policy lost_found_items_insert_own
on public.lost_found_items
for insert
to authenticated
with check (
  author_id = (select p.id from public.profiles p where p.auth_id = auth.uid())
);

create policy lost_found_items_update_own
on public.lost_found_items
for update
to authenticated
using (
  author_id = (select p.id from public.profiles p where p.auth_id = auth.uid())
);

create policy lost_found_items_delete_own
on public.lost_found_items
for delete
to authenticated
using (
  author_id = (select p.id from public.profiles p where p.auth_id = auth.uid())
);

-- 2) lost_found_claims table
create table if not exists public.lost_found_claims (
  id uuid default gen_random_uuid() primary key,
  item_id uuid not null,
  claimer_id uuid not null,
  claimed_at timestamptz not null default now(),
  notes text,
  constraint lost_found_claims_item_id_fkey foreign key (item_id) references public.lost_found_items (id) on delete cascade,
  constraint lost_found_claims_claimer_id_fkey foreign key (claimer_id) references public.profiles (id) on delete cascade,
  constraint lost_found_claims_unique_claim unique (item_id, claimer_id)
);

-- Indexes
create index if not exists lost_found_claims_item_id_idx on public.lost_found_claims (item_id);
create index if not exists lost_found_claims_claimer_id_idx on public.lost_found_claims (claimer_id);

-- Enable RLS
alter table public.lost_found_claims enable row level security;

-- RLS Policies
create policy lost_found_claims_select_all
on public.lost_found_claims
for select
to authenticated
using (true);

create policy lost_found_claims_insert_own
on public.lost_found_claims
for insert
to authenticated
with check (
  claimer_id = (select p.id from public.profiles p where p.auth_id = auth.uid())
);

create policy lost_found_claims_delete_own
on public.lost_found_claims
for delete
to authenticated
using (
  claimer_id = (select p.id from public.profiles p where p.auth_id = auth.uid())
);

-- 3) View: lost_found_items_with_profiles
create or replace view public.lost_found_items_with_profiles as
select
  lfi.id,
  lfi.item_name,
  lfi.description,
  lfi.phone_number,
  lfi.date_found,
  lfi.place_found,
  lfi.time_found,
  lfi.author_id,
  lfi.handed_over,
  lfi.handed_over_at,
  lfi.created_at,
  lfi.updated_at,
  p.full_name as author_full_name,
  p.display_name as author_display_name,
  p.role as author_role,
  p.department as author_department,
  p.institution as author_institution,
  p.avatar_url as author_avatar_url,
  p.email as author_email
from public.lost_found_items lfi
left join public.profiles p on p.id = lfi.author_id;

-- 4) RPC: rpc_lost_found_items_with_profiles
create or replace function public.rpc_lost_found_items_with_profiles()
returns table (
  id uuid,
  item_name text,
  description text,
  phone_number text,
  date_found date,
  place_found text,
  time_found time,
  author_id uuid,
  handed_over boolean,
  handed_over_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  author_full_name text,
  author_display_name text,
  author_role text,
  author_department text,
  author_institution text,
  author_avatar_url text,
  author_email text
)
language plpgsql
security definer
as $$
begin
  return query
  select
    lfi.id,
    lfi.item_name,
    lfi.description,
    lfi.phone_number,
    lfi.date_found,
    lfi.place_found,
    lfi.time_found,
    lfi.author_id,
    lfi.handed_over,
    lfi.handed_over_at,
    lfi.created_at,
    lfi.updated_at,
    p.full_name,
    p.display_name,
    p.role,
    p.department,
    p.institution,
    p.avatar_url,
    p.email
  from public.lost_found_items lfi
  left join public.profiles p on p.id = lfi.author_id
  order by lfi.created_at desc;
end;
$$;

grant execute on function public.rpc_lost_found_items_with_profiles() to authenticated;

-- 5) RPC: Toggle handed_over status
create or replace function public.rpc_toggle_handed_over(p_item_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_author_id uuid;
  v_current_status boolean;
  v_profile_id uuid;
begin
  -- Get current user's profile ID
  select p.id into v_profile_id
  from public.profiles p
  where p.auth_id = auth.uid();
  
  if v_profile_id is null then
    raise exception 'Profile not found';
  end if;
  
  -- Get item author and current status
  select author_id, handed_over into v_author_id, v_current_status
  from public.lost_found_items
  where id = p_item_id;
  
  if v_author_id is null then
    raise exception 'Item not found';
  end if;
  
  if v_author_id != v_profile_id then
    raise exception 'Only the item owner can update handed over status';
  end if;
  
  -- Toggle status
  update public.lost_found_items
  set 
    handed_over = not v_current_status,
    handed_over_at = case when not v_current_status then now() else null end,
    updated_at = now()
  where id = p_item_id;
  
  return not v_current_status;
end;
$$;

grant execute on function public.rpc_toggle_handed_over(uuid) to authenticated;

-- 6) RPC: Claim an item
create or replace function public.rpc_claim_item(p_item_id uuid, p_notes text default null)
returns uuid
language plpgsql
security definer
as $$
declare
  v_profile_id uuid;
  v_claim_id uuid;
begin
  -- Get current user's profile ID
  select p.id into v_profile_id
  from public.profiles p
  where p.auth_id = auth.uid();
  
  if v_profile_id is null then
    raise exception 'Profile not found';
  end if;
  
  -- Insert claim (will fail if already claimed by this user due to unique constraint)
  insert into public.lost_found_claims (item_id, claimer_id, notes)
  values (p_item_id, v_profile_id, p_notes)
  on conflict (item_id, claimer_id) do nothing
  returning id into v_claim_id;
  
  return v_claim_id;
end;
$$;

grant execute on function public.rpc_claim_item(uuid, text) to authenticated;

-- 7) RPC: Unclaim an item
create or replace function public.rpc_unclaim_item(p_item_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_profile_id uuid;
  v_deleted_count int;
begin
  -- Get current user's profile ID
  select p.id into v_profile_id
  from public.profiles p
  where p.auth_id = auth.uid();
  
  if v_profile_id is null then
    raise exception 'Profile not found';
  end if;
  
  delete from public.lost_found_claims
  where item_id = p_item_id and claimer_id = v_profile_id;
  
  get diagnostics v_deleted_count = row_count;
  
  return v_deleted_count > 0;
end;
$$;

grant execute on function public.rpc_unclaim_item(uuid) to authenticated;
```

### Update reports table to include Lost & Found items

```sql
-- Update the item_type check constraint to include 'lost_found'
alter table public.reports 
drop constraint if exists reports_item_type_check;

alter table public.reports 
add constraint reports_item_type_check check (
  item_type = any (array['post'::text, 'job'::text, 'study'::text, 'lost_found'::text])
);
```

This Lost & Found system allows users to:
- Post found items with details (name, description, phone, date/place found)
- Search through items by name and description
- Claim items they believe are theirs
- Mark items as "Handed Over" when returned to owner
- View all claimants for items they posted
- Edit/delete their own posts
- Report inappropriate posts
