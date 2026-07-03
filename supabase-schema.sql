-- Run this once in your Supabase project's SQL editor.
-- Creates a profile row per user to track free-roll usage and plan.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  rolls_used integer not null default 0,
  rolls_limit integer not null default 3,   -- free tier: 3 rolls
  plan text not null default 'free',        -- 'free' | 'paid' later
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read their own row. All writes happen server-side via the
-- service role key in the Netlify functions, so no write policy is
-- needed (and none should be added — that's what keeps credits honest).
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Auto-create a profile the moment someone signs up.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
