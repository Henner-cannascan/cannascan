-- Plant Monitor server database schema.
-- Target: PostgreSQL 15+.
--
-- Design goals:
-- - every application entity has a numeric, increasing bigint identity id
-- - data is scoped by workspace so multiple users can share one plant database
-- - legacy JSON ids are kept during migration but are not primary keys
-- - photos are stored as files/objects; the database stores metadata and paths

begin;

create extension if not exists citext;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Authentication and accounts
-- ---------------------------------------------------------------------------

create table users (
  id bigint generated always as identity primary key,
  email citext not null unique,
  display_name text not null default '',
  password_hash text not null,
  email_verified_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_format_check check (position('@' in email::text) > 1)
);

create trigger users_set_updated_at
before update on users
for each row execute function set_updated_at();

create table email_verification_tokens (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  token_hash text not null unique,
  sent_to citext not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index email_verification_tokens_user_idx
on email_verification_tokens(user_id, expires_at desc);

create table password_reset_tokens (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index password_reset_tokens_user_idx
on password_reset_tokens(user_id, expires_at desc);

create table login_sessions (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  session_token_hash text not null unique,
  remember_device boolean not null default false,
  user_agent text not null default '',
  ip_address inet,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index login_sessions_user_active_idx
on login_sessions(user_id, expires_at desc)
where revoked_at is null;

create table trusted_devices (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  device_name text not null default '',
  remember_token_hash text not null unique,
  user_agent text not null default '',
  ip_address inet,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index trusted_devices_user_active_idx
on trusted_devices(user_id, expires_at desc)
where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Workspaces and membership
-- ---------------------------------------------------------------------------

create table workspaces (
  id bigint generated always as identity primary key,
  name text not null,
  owner_user_id bigint not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint workspaces_name_not_blank check (length(trim(name)) > 0)
);

create trigger workspaces_set_updated_at
before update on workspaces
for each row execute function set_updated_at();

create table workspace_members (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  role text not null default 'member',
  invited_by_user_id bigint references users(id) on delete set null,
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint workspace_members_role_check check (role in ('owner', 'admin', 'member', 'viewer')),
  constraint workspace_members_unique_user unique (workspace_id, user_id)
);

create index workspace_members_user_active_idx
on workspace_members(user_id, workspace_id)
where removed_at is null;

-- ---------------------------------------------------------------------------
-- Reference data and workspace settings
-- ---------------------------------------------------------------------------

create table plant_families (
  id bigint generated always as identity primary key,
  slug text not null unique,
  label text not null,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  constraint plant_families_slug_check check (slug ~ '^[a-z][a-z0-9-]*$')
);

insert into plant_families (slug, label, sort_order)
values
  ('cannabis', 'Cannabis', 10),
  ('tomato', 'Tomate', 20),
  ('pepper', 'Paprika', 30),
  ('chili', 'Chili', 40)
on conflict (slug) do nothing;

create table workspace_enabled_families (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  family_id bigint not null references plant_families(id) on delete restrict,
  enabled_at timestamptz not null default now(),
  enabled_by_user_id bigint references users(id) on delete set null,
  constraint workspace_enabled_families_unique unique (workspace_id, family_id)
);

create index workspace_enabled_families_family_idx
on workspace_enabled_families(family_id, workspace_id);

-- ---------------------------------------------------------------------------
-- Varieties, shop links and per-workspace visibility
-- ---------------------------------------------------------------------------

create table varieties (
  id bigint generated always as identity primary key,
  workspace_id bigint references workspaces(id) on delete cascade,
  family_id bigint not null references plant_families(id) on delete restrict,
  legacy_key text,
  breeder text not null default '',
  name text not null,
  type text not null default '',
  appearance text not null default '',
  height_min_cm integer,
  height_max_cm integer,
  size_class text not null default 'medium',
  lifecycle_days integer not null default 150,
  taste text not null default '',
  difficulty text not null default 'Mittel',
  source text not null default 'manual',
  is_custom boolean not null default true,
  created_by_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint varieties_name_not_blank check (length(trim(name)) > 0),
  constraint varieties_height_check check (
    height_min_cm is null
    or height_max_cm is null
    or height_min_cm <= height_max_cm
  ),
  constraint varieties_size_class_check check (size_class in ('compact', 'medium', 'large', 'very-large')),
  constraint varieties_lifecycle_days_check check (lifecycle_days > 0)
);

create trigger varieties_set_updated_at
before update on varieties
for each row execute function set_updated_at();

create unique index varieties_global_legacy_key_uidx
on varieties(legacy_key)
where workspace_id is null and legacy_key is not null;

create unique index varieties_workspace_legacy_key_uidx
on varieties(workspace_id, legacy_key)
where workspace_id is not null and legacy_key is not null;

create index varieties_family_name_idx
on varieties(family_id, lower(name), lower(breeder))
where archived_at is null;

create index varieties_workspace_idx
on varieties(workspace_id, family_id)
where archived_at is null;

create table variety_traits (
  id bigint generated always as identity primary key,
  variety_id bigint not null references varieties(id) on delete cascade,
  trait text not null,
  sort_order integer not null default 0,
  constraint variety_traits_not_blank check (length(trim(trait)) > 0),
  constraint variety_traits_unique unique (variety_id, trait)
);

create table variety_cannabis_forms (
  id bigint generated always as identity primary key,
  variety_id bigint not null references varieties(id) on delete cascade,
  form text not null,
  constraint variety_cannabis_forms_check check (form in ('autoflower', 'feminized', 'regular', 'cbd')),
  constraint variety_cannabis_forms_unique unique (variety_id, form)
);

create table workspace_hidden_varieties (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  variety_id bigint not null references varieties(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  hidden_by_user_id bigint references users(id) on delete set null,
  constraint workspace_hidden_varieties_unique unique (workspace_id, variety_id)
);

create table variety_shop_links (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  variety_id bigint not null references varieties(id) on delete cascade,
  shop_name text not null,
  url text not null,
  price text not null default '',
  currency text not null default 'EUR',
  unit text not null default '',
  note text not null default '',
  source text not null default 'manual',
  created_by_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint variety_shop_links_shop_not_blank check (length(trim(shop_name)) > 0),
  constraint variety_shop_links_url_not_blank check (length(trim(url)) > 0)
);

create trigger variety_shop_links_set_updated_at
before update on variety_shop_links
for each row execute function set_updated_at();

create index variety_shop_links_variety_idx
on variety_shop_links(workspace_id, variety_id)
where archived_at is null;

-- ---------------------------------------------------------------------------
-- Locations and care plans
-- ---------------------------------------------------------------------------

create table locations (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  created_by_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint locations_name_not_blank check (length(trim(name)) > 0),
  constraint locations_unique_normalized unique (workspace_id, normalized_name)
);

create trigger locations_set_updated_at
before update on locations
for each row execute function set_updated_at();

create table care_plan_templates (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  legacy_key text,
  name text not null,
  note text not null default '',
  water_every_days integer not null default 0,
  feed_every_days integer not null default 0,
  observe_every_days integer not null default 0,
  photo_every_days integer not null default 0,
  created_by_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint care_plan_templates_name_not_blank check (length(trim(name)) > 0),
  constraint care_plan_templates_intervals_check check (
    water_every_days >= 0
    and feed_every_days >= 0
    and observe_every_days >= 0
    and photo_every_days >= 0
  ),
  constraint care_plan_templates_legacy_unique unique (workspace_id, legacy_key)
);

create trigger care_plan_templates_set_updated_at
before update on care_plan_templates
for each row execute function set_updated_at();

create index care_plan_templates_workspace_active_idx
on care_plan_templates(workspace_id, lower(name))
where archived_at is null;

-- ---------------------------------------------------------------------------
-- Plants, events, plan history and photos
-- ---------------------------------------------------------------------------

create table plants (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  legacy_key text,
  variety_id bigint references varieties(id) on delete set null,
  nickname text not null,
  started_at date not null,
  stage text not null default 'seed',
  cannabis_form text,
  initial_location_id bigint references locations(id) on delete set null,
  current_location_id bigint references locations(id) on delete set null,
  care_plan_template_id bigint references care_plan_templates(id) on delete set null,
  override_water_every_days integer,
  override_feed_every_days integer,
  override_observe_every_days integer,
  override_photo_every_days integer,
  public_token text not null default regexp_replace(translate(encode(gen_random_bytes(18), 'base64'), '+/', '-_'), '=+$', ''),
  legacy_short_code text,
  created_by_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_reason text not null default '',
  archived_at timestamptz,
  constraint plants_nickname_not_blank check (length(trim(nickname)) > 0),
  constraint plants_stage_check check (
    stage in ('seed', 'germination', 'seedling', 'vegetative', 'flowering', 'harvest', 'decline', 'dead')
  ),
  constraint plants_cannabis_form_check check (
    cannabis_form is null or cannabis_form in ('autoflower', 'feminized', 'regular', 'cbd')
  ),
  constraint plants_override_intervals_check check (
    coalesce(override_water_every_days, 0) >= 0
    and coalesce(override_feed_every_days, 0) >= 0
    and coalesce(override_observe_every_days, 0) >= 0
    and coalesce(override_photo_every_days, 0) >= 0
  ),
  constraint plants_public_token_unique unique (public_token),
  constraint plants_legacy_unique unique (workspace_id, legacy_key)
);

create trigger plants_set_updated_at
before update on plants
for each row execute function set_updated_at();

create index plants_workspace_active_idx
on plants(workspace_id, stage, started_at desc)
where hidden_at is null and archived_at is null;

create index plants_workspace_variety_idx
on plants(workspace_id, variety_id)
where archived_at is null;

create table plant_events (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  plant_id bigint not null references plants(id) on delete cascade,
  legacy_key text,
  event_type text not null,
  event_date date not null,
  amount text not null default '',
  note text not null default '',
  stage text,
  location_id bigint references locations(id) on delete set null,
  location_change boolean not null default false,
  created_by_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint plant_events_type_check check (
    event_type in ('water', 'feed', 'repot', 'prune', 'observe', 'location', 'photo', 'stage', 'harvest')
  ),
  constraint plant_events_stage_check check (
    stage is null
    or stage in ('seed', 'germination', 'seedling', 'vegetative', 'flowering', 'harvest', 'decline', 'dead')
  ),
  constraint plant_events_legacy_unique unique (workspace_id, plant_id, legacy_key)
);

create trigger plant_events_set_updated_at
before update on plant_events
for each row execute function set_updated_at();

create index plant_events_plant_date_idx
on plant_events(plant_id, event_date desc, id desc)
where deleted_at is null;

create index plant_events_workspace_type_date_idx
on plant_events(workspace_id, event_type, event_date desc)
where deleted_at is null;

create table plant_care_plan_history (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  plant_id bigint not null references plants(id) on delete cascade,
  legacy_key text,
  care_plan_template_id bigint references care_plan_templates(id) on delete set null,
  plan_name text not null,
  template_name text not null default '',
  customized boolean not null default false,
  water_every_days integer not null default 0,
  feed_every_days integer not null default 0,
  observe_every_days integer not null default 0,
  photo_every_days integer not null default 0,
  reason text not null default '',
  started_at date not null,
  ended_at date,
  created_at timestamptz not null default now(),
  constraint plant_care_plan_history_dates_check check (ended_at is null or ended_at >= started_at),
  constraint plant_care_plan_history_intervals_check check (
    water_every_days >= 0
    and feed_every_days >= 0
    and observe_every_days >= 0
    and photo_every_days >= 0
  ),
  constraint plant_care_plan_history_legacy_unique unique (workspace_id, plant_id, legacy_key)
);

create index plant_care_plan_history_plant_idx
on plant_care_plan_history(plant_id, started_at desc);

create table photos (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  plant_id bigint not null references plants(id) on delete cascade,
  event_id bigint references plant_events(id) on delete set null,
  legacy_key text,
  storage_provider text not null default 'local',
  file_key text not null,
  thumb_key text,
  original_file_name text not null default '',
  mime_type text not null,
  size_bytes bigint,
  width_px integer,
  height_px integer,
  checksum_sha256 text,
  created_by_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint photos_file_key_not_blank check (length(trim(file_key)) > 0),
  constraint photos_mime_type_check check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  constraint photos_size_check check (size_bytes is null or size_bytes > 0),
  constraint photos_dimensions_check check (
    (width_px is null and height_px is null)
    or (width_px > 0 and height_px > 0)
  ),
  constraint photos_legacy_unique unique (workspace_id, legacy_key)
);

create index photos_plant_created_idx
on photos(plant_id, created_at desc)
where deleted_at is null;

create index photos_workspace_created_idx
on photos(workspace_id, created_at desc)
where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Migration bookkeeping and audit trail
-- ---------------------------------------------------------------------------

create table legacy_import_runs (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  source_directory text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  summary jsonb not null default '{}'::jsonb,
  constraint legacy_import_runs_status_check check (status in ('running', 'completed', 'failed'))
);

create table legacy_id_map (
  id bigint generated always as identity primary key,
  import_run_id bigint not null references legacy_import_runs(id) on delete cascade,
  entity_type text not null,
  legacy_id text not null,
  target_table text not null,
  target_id bigint not null,
  created_at timestamptz not null default now(),
  constraint legacy_id_map_unique unique (import_run_id, entity_type, legacy_id)
);

create table audit_log (
  id bigint generated always as identity primary key,
  workspace_id bigint references workspaces(id) on delete set null,
  actor_user_id bigint references users(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id bigint,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_workspace_created_idx
on audit_log(workspace_id, created_at desc);

commit;
