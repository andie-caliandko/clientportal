-- Logins clients share with the team (Instagram, website, etc.). The password is
-- encrypted by the app with a key the database never sees, so it's unreadable here.
create table if not exists client_logins (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  client_id uuid not null references clients on delete cascade,
  service text not null,
  username text,
  secret_enc text,
  url text,
  note text,
  created_by uuid references auth.users,
  updated_by uuid references auth.users,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists client_logins_client on client_logins (client_id);
alter table client_logins enable row level security;
-- The client and the team on the account can see the list (passwords stay encrypted).
drop policy if exists logins_read on client_logins;
create policy logins_read on client_logins for select using (is_client_user(client_id) or is_client_staff(client_id));
-- All changes go through the portal's server, which checks who's allowed.

-- Every time someone on the team reveals a password.
create table if not exists client_login_reveals (
  id uuid primary key default gen_random_uuid(),
  login_id uuid not null references client_logins on delete cascade,
  client_id uuid not null references clients on delete cascade,
  user_id uuid not null references auth.users,
  revealed_at timestamptz not null default now()
);
create index if not exists client_login_reveals_login on client_login_reveals (login_id, revealed_at desc);
alter table client_login_reveals enable row level security;
drop policy if exists reveals_read on client_login_reveals;
create policy reveals_read on client_login_reveals for select using (is_client_staff(client_id));
