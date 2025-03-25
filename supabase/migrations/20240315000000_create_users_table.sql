-- Create users table
create table if not exists public.users (
  id uuid primary key,
  auth_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null check (role in ('coach', 'client')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.users enable row level security;

-- Create policies
create policy "Users can view their own profile"
  on users for select
  using (auth.uid() = auth_id);

create policy "Users can update their own profile"
  on users for update
  using (auth.uid() = auth_id);

-- Create indexes
create index if not exists users_auth_id_idx on users(auth_id);
create index if not exists users_email_idx on users(email);

-- Create updated_at trigger
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create trigger handle_updated_at
  before update on users
  for each row
  execute procedure public.handle_updated_at(); 