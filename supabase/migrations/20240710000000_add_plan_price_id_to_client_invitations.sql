-- Add plan_price_id column to client_invitations to store the Stripe price ID for the invited client's subscription plan
ALTER TABLE client_invitations ADD COLUMN plan_price_id text; 