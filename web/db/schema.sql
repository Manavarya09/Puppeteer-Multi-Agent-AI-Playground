create table if not exists runs (
  id text primary key,
  task text not null,
  subspace text not null,
  budget integer not null,
  status text not null,
  total_tokens integer not null default 0,
  cost_usd numeric(10,4) not null default 0,
  final_output text not null default '',
  final_confidence real not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  snapshot jsonb
);

create table if not exists invocations (
  id text primary key,
  run_id text not null references runs(id) on delete cascade,
  step integer not null,
  agent_id text not null,
  prompt text not null,
  output text not null,
  status text not null,
  prompt_tokens integer not null,
  completion_tokens integer not null,
  duration_ms integer not null,
  confidence real not null,
  start_ts timestamptz,
  end_ts timestamptz,
  sources jsonb
);

create table if not exists decisions (
  id bigserial primary key,
  run_id text not null references runs(id) on delete cascade,
  step integer not null,
  selected text not null,
  rationale text not null,
  candidates jsonb not null,
  decided_at timestamptz
);

create table if not exists edges (
  id bigserial primary key,
  run_id text not null references runs(id) on delete cascade,
  from_agent text not null,
  to_agent text not null,
  weight integer not null,
  last_step integer not null,
  unique (run_id, from_agent, to_agent)
);

create index if not exists idx_runs_started_at on runs (started_at desc);
create index if not exists idx_invocations_run_id on invocations (run_id);
create index if not exists idx_decisions_run_id on decisions (run_id);
create index if not exists idx_edges_run_id on edges (run_id);
