-- Supabase Schema for skej Schedule Database
-- Run this in the Supabase SQL Editor

-- Enable pgvector extension for semantic search
create extension if not exists vector;

-- Schedule items table
create table if not exists schedule_items (
  id text primary key,
  product text not null,
  class text not null check (class in ('I', 'IIa', 'IIb', 'III')),
  type text,
  start_period date,
  end_period date,
  frequency text,
  due_date date,
  status text default 'Not Started',
  writer text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  
  -- Embedding for semantic search (1536 dimensions for OpenAI text-embedding-3-small)
  embedding vector(1536)
);

-- Add writer column if table already exists
alter table schedule_items add column if not exists writer text;

-- Index for vector similarity search
create index if not exists schedule_items_embedding_idx 
  on schedule_items 
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Index for common queries
create index if not exists schedule_items_class_idx on schedule_items(class);
create index if not exists schedule_items_status_idx on schedule_items(status);
create index if not exists schedule_items_due_date_idx on schedule_items(due_date);

-- Function to update the updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Trigger to auto-update updated_at
create trigger update_schedule_items_updated_at
  before update on schedule_items
  for each row
  execute function update_updated_at_column();

-- Function for semantic search
create or replace function search_schedule_items(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count int default 10
)
returns table (
  id text,
  product text,
  class text,
  type text,
  start_period date,
  end_period date,
  frequency text,
  due_date date,
  status text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    si.id,
    si.product,
    si.class,
    si.type,
    si.start_period,
    si.end_period,
    si.frequency,
    si.due_date,
    si.status,
    1 - (si.embedding <=> query_embedding) as similarity
  from schedule_items si
  where 1 - (si.embedding <=> query_embedding) > match_threshold
  order by si.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Enable Row Level Security (optional but recommended)
alter table schedule_items enable row level security;

-- Policy to allow all operations (adjust based on your auth needs)
create policy "Allow all operations" on schedule_items
  for all using (true);

-- Enable real-time subscriptions
alter publication supabase_realtime add table schedule_items;

