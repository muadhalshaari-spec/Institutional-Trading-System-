-- Bybit market storage for the institutional platform engine.
-- Apply this migration to the target Supabase project before starting the collector.

create table if not exists public.market_candles (
  category text not null,
  symbol text not null,
  series text not null check (series in ('last','mark','index','premium')),
  interval text not null,
  start_time_ms bigint not null,
  end_time_ms bigint not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric,
  turnover numeric,
  confirm boolean not null default false,
  source_timestamp_ms bigint,
  updated_at timestamptz not null default now(),
  primary key (category, symbol, series, interval, start_time_ms)
);

create index if not exists market_candles_lookup
  on public.market_candles (category, symbol, series, interval, start_time_ms desc);

create table if not exists public.market_instruments (
  category text not null,
  symbol text not null,
  instrument jsonb not null,
  observed_at timestamptz not null default now(),
  primary key (category, symbol)
);

create table if not exists public.market_trades (
  event_id text primary key,
  category text not null,
  symbol text not null,
  trade_time_ms bigint not null,
  side text,
  price numeric,
  size numeric,
  sequence_id text,
  is_block_trade boolean,
  is_rpi_trade boolean,
  raw jsonb,
  observed_at timestamptz not null default now()
);

create index if not exists market_trades_time
  on public.market_trades (category, symbol, trade_time_ms desc);

create table if not exists public.market_orderbook_updates (
  event_id text primary key,
  category text not null,
  symbol text not null,
  message_type text not null,
  event_time_ms bigint not null,
  update_id bigint,
  cross_sequence bigint,
  matching_engine_time_ms bigint,
  bids jsonb not null default '[]'::jsonb,
  asks jsonb not null default '[]'::jsonb,
  raw jsonb,
  observed_at timestamptz not null default now()
);

create index if not exists market_orderbook_updates_time
  on public.market_orderbook_updates (category, symbol, event_time_ms desc);

create table if not exists public.market_orderbook_state (
  category text not null,
  symbol text not null,
  event_time_ms bigint not null,
  update_id bigint,
  cross_sequence bigint,
  matching_engine_time_ms bigint,
  bids jsonb not null,
  asks jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (category, symbol)
);

create table if not exists public.market_ticker_state (
  category text not null,
  symbol text not null,
  event_time_ms bigint not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (category, symbol)
);

create table if not exists public.market_liquidations (
  event_id text primary key,
  category text not null,
  symbol text not null,
  event_time_ms bigint not null,
  side text,
  size numeric,
  bankruptcy_price numeric,
  raw jsonb,
  observed_at timestamptz not null default now()
);

create index if not exists market_liquidations_time
  on public.market_liquidations (category, symbol, event_time_ms desc);

create table if not exists public.market_funding (
  category text not null,
  symbol text not null,
  funding_time_ms bigint not null,
  funding_rate numeric,
  raw jsonb,
  observed_at timestamptz not null default now(),
  primary key (category, symbol, funding_time_ms)
);

create table if not exists public.market_open_interest (
  category text not null,
  symbol text not null,
  interval_time text not null,
  timestamp_ms bigint not null,
  open_interest numeric,
  open_interest_value numeric,
  raw jsonb,
  observed_at timestamptz not null default now(),
  primary key (category, symbol, interval_time, timestamp_ms)
);

create table if not exists public.market_account_ratio (
  category text not null,
  symbol text not null,
  period text not null,
  timestamp_ms bigint not null,
  buy_ratio numeric,
  sell_ratio numeric,
  raw jsonb,
  observed_at timestamptz not null default now(),
  primary key (category, symbol, period, timestamp_ms)
);

create table if not exists public.market_reference (
  reference_key text not null,
  category text not null,
  symbol text not null,
  data jsonb not null,
  observed_at timestamptz not null default now(),
  primary key (reference_key, category, symbol)
);

create table if not exists public.market_raw_events (
  event_id text primary key,
  topic text not null,
  event_time_ms bigint not null,
  payload jsonb not null,
  observed_at timestamptz not null default now()
);

create index if not exists market_raw_events_topic_time
  on public.market_raw_events (topic, event_time_ms desc);

create table if not exists public.collector_health (
  id text primary key,
  category text not null,
  symbol text not null,
  process_started_at_ms bigint not null,
  ws_connected boolean not null,
  ws_last_message_at_ms bigint,
  rest_last_success_at_ms bigint,
  last_error_at_ms bigint,
  last_error text,
  messages bigint not null default 0,
  trades bigint not null default 0,
  orderbook_messages bigint not null default 0,
  ticker_messages bigint not null default 0,
  candle_messages bigint not null default 0,
  liquidation_messages bigint not null default 0,
  queued_rows bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- Defense in depth: every public table used by the collector has RLS enabled.
alter table public.market_candles enable row level security;
alter table public.market_instruments enable row level security;
alter table public.market_trades enable row level security;
alter table public.market_orderbook_updates enable row level security;
alter table public.market_orderbook_state enable row level security;
alter table public.market_ticker_state enable row level security;
alter table public.market_liquidations enable row level security;
alter table public.market_funding enable row level security;
alter table public.market_open_interest enable row level security;
alter table public.market_account_ratio enable row level security;
alter table public.market_reference enable row level security;
alter table public.market_raw_events enable row level security;
alter table public.collector_health enable row level security;

-- No anon/authenticated policies are created here on purpose.
-- The collector uses the server-side Supabase service-role key.
-- Add narrowly scoped read policies later only if a client must query these tables directly.
