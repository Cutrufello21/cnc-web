-- Backups table — stores daily automated database snapshots
create table if not exists backups (
  id bigint generated always as identity primary key,
  snapshot jsonb not null,
  table_counts jsonb,
  total_rows integer,
  size_mb numeric(6,2),
  created_at timestamptz default now()
);

-- Error logs table — stores client and server errors
create table if not exists error_logs (
  id bigint generated always as identity primary key,
  type text not null default 'client_error',
  message text not null,
  stack text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Index for cleanup queries
create index if not exists idx_backups_created_at on backups(created_at desc);
create index if not exists idx_error_logs_created_at on error_logs(created_at desc);
create index if not exists idx_error_logs_type on error_logs(type);

-- RLS: service role only (no anon access)
alter table backups enable row level security;
alter table error_logs enable row level security;

-- Allow service role full access (Vercel API uses service role key)
create policy "Service role full access on backups"
  on backups for all
  using (true)
  with check (true);

create policy "Service role full access on error_logs"
  on error_logs for all
  using (true)
  with check (true);
