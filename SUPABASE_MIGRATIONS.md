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

