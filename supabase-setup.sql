-- Run this SQL in your Supabase SQL Editor to create the node_cards table
-- https://supabase.com/dashboard → SQL Editor

create table if not exists node_cards (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  city text,
  doing text,
  topics text[] default '{}',
  experience text,
  offer text,
  seeking text,
  product text,
  wechat text,
  email text,
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table node_cards enable row level security;

-- Allow inserts from anonymous users (for the join form)
create policy "Allow anonymous inserts" on node_cards
  for insert with check (true);

-- Only allow authenticated users to read (for admin)
create policy "Allow authenticated reads" on node_cards
  for select using (auth.role() = 'authenticated');
