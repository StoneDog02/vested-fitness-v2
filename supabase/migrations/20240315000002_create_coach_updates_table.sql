-- Create coach updates table
create table if not exists public.coach_updates (
  id uuid primary key default uuid_generate_v4(),
  coach_id uuid not null references public.users(id) on delete cascade,
  client_id uuid not null references public.users(id) on delete cascade,
  message text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.coach_updates enable row level security;

-- Create policies
create policy "Coaches can view their own updates"
  on coach_updates for select
  using (auth.uid() = (select auth_id from users where id = coach_id));

create policy "Clients can view updates from their coach"
  on coach_updates for select
  using (auth.uid() = (select auth_id from users where id = client_id));

create policy "Coaches can insert updates"
  on coach_updates for insert
  with check (auth.uid() = (select auth_id from users where id = coach_id));

-- Create indexes
create index if not exists coach_updates_coach_id_idx on coach_updates(coach_id);
create index if not exists coach_updates_client_id_idx on coach_updates(client_id);
create index if not exists coach_updates_created_at_idx on coach_updates(created_at);

-- Create updated_at trigger
create trigger handle_updated_at
  before update on coach_updates
  for each row
  execute procedure public.handle_updated_at(); 