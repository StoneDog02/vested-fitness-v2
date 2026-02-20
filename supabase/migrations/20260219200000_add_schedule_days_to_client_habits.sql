-- schedule_days: 0=Mon, 1=Tue, ..., 6=Sun (for weekly / times_per_week cadence)
ALTER TABLE client_habits ADD COLUMN IF NOT EXISTS schedule_days SMALLINT[] NULL;
