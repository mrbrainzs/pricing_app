-- Quin Súper: initial schema.
-- Catalogue tables (chains, stores, products, prices) are public read-only and written
-- by the daily import with the service role. User tables (lists, alerts) are protected
-- by row-level security; users start with Supabase anonymous sign-in (no account needed)
-- and link Apple/Google later to share lists.

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- Chains and stores ---------------------------------------------------------

create table chains (
  id text primary key,                      -- 'mercadona', 'bonpreu', ...
  name text not null,
  online boolean not null default false,    -- prices collected online in v1
  single_price_zone boolean not null default false
);

insert into chains (id, name, online, single_price_zone) values
  ('mercadona', 'Mercadona', true, false),
  ('alcampo', 'Alcampo', true, false),
  ('bonarea', 'bonÀrea', true, true),
  ('caprabo', 'Caprabo', true, false),
  ('dia', 'DIA', true, false),
  ('bonpreu', 'Bonpreu / Esclat', true, true),
  ('aldi', 'Aldi', false, false),
  ('condis', 'Condis', false, false),
  ('lidl', 'Lidl', false, false);

create table stores (
  id text primary key,
  chain text not null references chains(id),
  name text not null,
  address text,
  postal_code text,
  zone text not null,                       -- pricing zone this store uses
  lat double precision not null,
  lng double precision not null,
  opening_hours jsonb,                      -- OSM-style or per-weekday ranges
  updated_at timestamptz not null default now()
);
create index stores_chain_idx on stores (chain);

-- Which pricing zone a chain uses for a postal code (e.g. Mercadona warehouse).
create table postal_zones (
  chain text not null references chains(id),
  postal_code text not null,
  zone text not null,
  checked_at timestamptz not null default now(),
  primary key (chain, postal_code)
);

-- Products and prices --------------------------------------------------------

create table categories (
  id text primary key,                      -- generic item: 'milk', 'eggs'
  group_id text not null,
  name_ca text not null,
  name_es text not null,
  name_en text not null,
  default_size numeric not null,
  default_unit text not null check (default_unit in ('kg', 'l', 'unit'))
);

create table products (
  id uuid primary key default gen_random_uuid(),
  chain text not null references chains(id),
  chain_product_id text not null,
  ean text,
  name text not null,
  brand text,
  is_own_brand boolean not null default false,
  category_id text references categories(id),
  size_amount numeric,
  size_unit text check (size_unit in ('kg', 'l', 'unit')),
  image_url text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  -- Previous size, kept to detect shrinkflation (size down, unit price up).
  previous_size_amount numeric,
  size_changed_at timestamptz,
  unique (chain, chain_product_id)
);
create index products_ean_idx on products (ean) where ean is not null;
create index products_category_idx on products (category_id, chain);
create index products_name_trgm_idx on products using gin (lower(name) gin_trgm_ops);

-- Append-only price log. Every price keeps its source and time (freshness label F8).
create table price_observations (
  id bigint generated always as identity primary key,
  product_id uuid not null references products(id) on delete cascade,
  chain text not null references chains(id),
  zone text not null,
  store_id text references stores(id),      -- set for in-store (receipt) prices
  price numeric(10, 2) not null check (price > 0),
  unit_price numeric(10, 4),
  promotion text,
  observed_at timestamptz not null,
  source text not null check (source in ('online', 'receipt', 'leaflet')),
  match_confidence real
);
create index price_obs_lookup_idx on price_observations (product_id, zone, observed_at desc);
create index price_obs_store_idx on price_observations (store_id, observed_at desc) where store_id is not null;

-- Latest usable price per product and zone (or store, for receipt prices).
-- Online prices older than 7 days and receipt prices older than 14 days are left out.
create view latest_prices with (security_invoker = true) as
select distinct on (product_id, zone, coalesce(store_id, ''))
  product_id, chain, zone, store_id, price, unit_price, promotion, observed_at, source
from price_observations
where observed_at > now() - case when source = 'receipt' then interval '14 days' else interval '7 days' end
order by product_id, zone, coalesce(store_id, ''), observed_at desc;

-- Pre-computed matches between products (exact / same product other size / own-brand equivalent).
create table product_matches (
  product_a uuid not null references products(id) on delete cascade,
  product_b uuid not null references products(id) on delete cascade,
  match_type text not null check (match_type in ('exact', 'same_product_other_size', 'own_brand_equivalent')),
  confidence real not null default 1,
  primary key (product_a, product_b)
);

-- Typo-tolerant search across product names (Spanish/Catalan, accents ignored).
create or replace function search_products(q text, max_results int default 50)
returns setof products
language sql stable
as $$
  select p.*
  from products p
  where unaccent(lower(p.name)) % unaccent(lower(q))
     or unaccent(lower(p.name)) like '%' || unaccent(lower(q)) || '%'
     or p.ean = q
  order by similarity(unaccent(lower(p.name)), unaccent(lower(q))) desc
  limit max_results;
$$;

-- User data --------------------------------------------------------------------

create table lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Llista',
  invite_code text unique default encode(gen_random_bytes(9), 'base64'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table list_members (
  list_id uuid not null references lists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create table list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists(id) on delete cascade,
  text text not null,
  category_id text references categories(id),
  level text not null default 'any' check (level in ('own', 'any', 'specific')),
  brand text,
  quantity int not null default 1 check (quantity > 0),
  checked boolean not null default false,
  added_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index list_items_list_idx on list_items (list_id);

create table price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  target_price numeric(10, 2),             -- null = any drop
  push_token text,
  last_notified_price numeric(10, 2),
  created_at timestamptz not null default now()
);

-- Row-level security -----------------------------------------------------------

alter table chains enable row level security;
alter table stores enable row level security;
alter table postal_zones enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table price_observations enable row level security;
alter table product_matches enable row level security;
alter table lists enable row level security;
alter table list_members enable row level security;
alter table list_items enable row level security;
alter table price_alerts enable row level security;

create policy "catalogue is public" on chains for select using (true);
create policy "catalogue is public" on stores for select using (true);
create policy "catalogue is public" on postal_zones for select using (true);
create policy "catalogue is public" on categories for select using (true);
create policy "catalogue is public" on products for select using (true);
create policy "catalogue is public" on price_observations for select using (true);
create policy "catalogue is public" on product_matches for select using (true);

create or replace function is_list_member(l uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from list_members where list_id = l and user_id = auth.uid()) $$;

create policy "members read lists" on lists for select using (is_list_member(id) or owner_id = auth.uid());
create policy "owner creates lists" on lists for insert with check (owner_id = auth.uid());
create policy "owner updates lists" on lists for update using (owner_id = auth.uid());
create policy "owner deletes lists" on lists for delete using (owner_id = auth.uid());

create policy "members see members" on list_members for select using (is_list_member(list_id));
create policy "owner adds self" on list_members for insert
  with check (user_id = auth.uid() and exists (select 1 from lists where id = list_id and owner_id = auth.uid()));
create policy "member leaves" on list_members for delete using (user_id = auth.uid());

create policy "members manage items" on list_items for all
  using (is_list_member(list_id)) with check (is_list_member(list_id));

create policy "own alerts" on price_alerts for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The owner of a new list is its first member.
create or replace function add_owner_as_member() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into list_members (list_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;
create trigger lists_owner_member after insert on lists for each row execute function add_owner_as_member();

-- Joining a shared list by invite link (UC4). Requires a signed-in (non-anonymous) user.
create or replace function join_list(code text) returns uuid
language plpgsql security definer set search_path = public
as $$
declare l uuid;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'sign in to join a shared list';
  end if;
  select id into l from lists where invite_code = code;
  if l is null then raise exception 'invalid invite'; end if;
  insert into list_members (list_id, user_id) values (l, auth.uid()) on conflict do nothing;
  return l;
end $$;

-- Real-time sync for shared lists.
alter publication supabase_realtime add table list_items;
