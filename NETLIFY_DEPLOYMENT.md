# Netlify Deployment Guide

This guide will help you deploy your Kava Training v2 Remix application to Netlify.

## Prerequisites

1. A Netlify account
2. Your repository connected to Netlify
3. All environment variables ready

## Environment Variables

You need to set these environment variables in your Netlify dashboard (Site settings > Environment variables):

### Required Variables

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `SUPABASE_SERVICE_KEY` - Your Supabase service role key
- `SUPABASE_EMAIL_REDIRECT_TO` - Your Netlify app URL (e.g., `https://your-app.netlify.app`)
- `RESEND_API_KEY` - Your Resend API key for emails
- `OPENAI_API_KEY` - Your OpenAI API key
- `SESSION_SECRET` - A random secret string for sessions

### Optional Variables (if using Stripe)

- `STRIPE_SECRET_KEY` - Your Stripe secret key
- `STRIPE_PUBLISHABLE_KEY` - Your Stripe publishable key
- `STRIPE_WEBHOOK_SECRET` - Your Stripe webhook secret

## Netlify Configuration

The `netlify.toml` file has been configured with:
- Build command: `npm run build`
- Publish directory: `build/client`
- Functions directory: `build/server`
- Proper redirects for SPA routing
- Security headers
- Static asset caching

## Deployment Steps

1. **Connect Repository**: Link your GitHub repository to Netlify
2. **Configure Build Settings**: 
   - Build command: `npm run build`
   - Publish directory: `build/client`
   - Functions directory: `build/server`
3. **Set Environment Variables**: Add all required environment variables in Netlify dashboard
4. **Deploy**: Trigger your first deployment

## Domain Configuration

1. After deployment, update your Supabase Auth settings:
   - Add your Netlify domain to the allowed redirect URLs
   - Update `SUPABASE_EMAIL_REDIRECT_TO` environment variable

## Testing

After deployment:
1. Test user registration/login
2. Test all main features (meals, workouts, supplements)
3. Test email functionality
4. Test file uploads (avatar)

## Troubleshooting

- Check Netlify function logs for server-side errors
- Verify all environment variables are set correctly
- Ensure Supabase RLS policies allow your domain
- Check browser console for client-side errors

## Performance

The configuration includes:
- Static asset caching (1 year)
- Security headers
- Optimized builds with Vite

Your app should load quickly and be fully functional on Netlify! 