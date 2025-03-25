-- Add insert policy for service role
create policy "Service role can insert users"
  on users for insert
  with check (true);  -- The service role bypasses RLS anyway, but we need a policy to allow inserts

-- Add policy for users to read any profile
create policy "Users can read any profile"
  on users for select
  using (true);  -- This allows reading any profile, which is needed for the dashboard 