# Supabase setup for MST

This step prepares the database and account privacy rules. It does not create a Supabase project or upload any user data.

## Create the free project

Create a Supabase project on the Free plan. MST is designed to stay on free services; free projects can pause after a week with very little activity, and Supabase's default email sender is limited to two emails per hour. That is suitable for early setup and small tests, but may constrain public sign-ups until we choose a free email provider.

## Apply the database migration

In the Supabase project, open **SQL Editor**, create a new query, paste the contents of `supabase/migrations/202611050001_accounts_profiles_owner_stats.sql`, and run it.

This creates private-by-default profiles, prevents users from reading or changing another user's profile, and adds an owner-only function that returns three counts: total accounts, accounts active in the past 30 days, and new accounts in the past 30 days. Activity is recorded at most once every 15 minutes, with no title-level activity history.

## Set the app connection values

In the project's **Connect** dialog, copy the Project URL and publishable key into a local `.env.local` file using `.env.example` as a guide. Do not put a Supabase secret or service-role key in the app or share one in chat. Publishable keys are intended for browser apps when RLS is enabled.

The Profile screen supports email/password sign-up, sign-in, and password reset. For Google sign-in, add the OAuth client ID and secret in Supabase **Authentication → Providers → Google**, then set `VITE_ENABLE_GOOGLE_AUTH=true` in `.env.local`. Do not put the Google client secret in `.env.local`; Supabase stores it in the provider settings. Apple sign-in remains out of this step while we keep the setup free.

Set the Supabase Auth **Site URL** to `https://imma016.github.io/MST/` and add the local development URL `http://localhost:5173/**` and the deployed app URL to the allowed redirect URLs.

## Make your account the owner

After your first MST account is created, run this in Supabase **SQL Editor**, replacing the email with the one you used to sign up:

```sql
insert into public.admin_users (user_id)
select id from auth.users where lower(email) = lower('YOUR_SIGNUP_EMAIL')
on conflict (user_id) do nothing;
```

The app will use the owner-only database function for aggregate counts. It will not expose other users' email addresses, profiles, or libraries to the owner dashboard.
