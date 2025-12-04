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

