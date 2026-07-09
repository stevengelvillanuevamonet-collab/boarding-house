# Boarding House Ledger

A simple rental management system for a boarding house: rooms, tenants, tenancies, and monthly rent tracking. Plain HTML/CSS/JS frontend, Supabase backend, deployed on Vercel.

## 1. Set up Supabase

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Once created, open **SQL Editor → New query**, paste the contents of `supabase/schema.sql`, and run it. This creates all tables, security policies, and triggers.
3. Go to **Project Settings → API** and copy your **Project URL** and **anon public key**.
4. Paste them into `js/supabaseClient.js`:
   ```js
   const SUPABASE_URL = "https://xxxxx.supabase.co";
   const SUPABASE_ANON_KEY = "eyJ...";
   ```

## 2. Create your admin account

1. In Supabase: **Authentication → Users → Add user**. Enter your email/password (check "Auto Confirm User").
2. Go to **Table Editor → profiles**. Find the row that was auto-created for you, and change its `role` from `tenant` to `admin`.
3. That's it — sign in on the site with that email/password and you'll land on the admin dashboard.

## 3. Add tenant accounts

Tenant logins are created the same way admin was:

1. **Authentication → Users → Add user** with the tenant's email/password. Their profile is auto-created with `role = tenant`.
2. In the app, go to **Tenants → Assign room to tenant**, pick their name and a vacant room, and save. This creates the tenancy and marks the room occupied.

(Tenant account creation is done in the Supabase Dashboard rather than in-app because creating auth users securely requires a server-side service-role key, which should never be placed in frontend code. This keeps the anon key — the only key this app uses — safe to expose publicly.)

## 4. Run locally

This is a static site — no build step. Easiest options:

```bash
# Option A: VS Code "Live Server" extension
# Option B: Python's built-in server
python3 -m http.server 5500
# then open http://localhost:5500
```

## 5. Deploy to Vercel

1. Push this folder to a GitHub repository.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
3. Framework preset: **Other** (it's a static site, no build command needed).
4. Deploy. Vercel will give you a live URL.

## How rent tracking works

- Click **Generate this month's rent** on the Payments tab once a month (or whenever new tenants are added). It creates one payment row per active tenancy, due on the 5th, using the room's monthly rate. It's safe to click more than once — it won't duplicate a month that's already been generated.
- A payment automatically becomes **overdue** (via a database trigger) once its due date has passed and it isn't fully paid — no manual step needed.
- Click **Mark paid** to record a payment in full.

## Project structure

```
index.html              Login page
admin/index.html        Admin dashboard (Overview, Rooms, Tenants, Payments)
tenant/index.html       Tenant's read-only view of their room + payments
css/style.css           Shared design system
js/supabaseClient.js    Supabase connection (add your credentials here)
js/auth.js              Login, session guard, sign out
js/admin.js             Admin dashboard logic
js/tenant.js            Tenant dashboard logic
supabase/schema.sql     Full database schema + Row Level Security policies
```

## Notes on security

All data access is enforced by **Row Level Security** in Postgres (see `supabase/schema.sql`), not by frontend code. A tenant's browser can only ever fetch rows tied to their own `auth.uid()` — even if someone edited the JavaScript, the database itself would refuse the request. Admins are identified by `profiles.role = 'admin'`.
