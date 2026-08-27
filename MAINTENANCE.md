# Maintenance guide

Plain-English notes for keeping Webhook Catcher running. You rarely have to touch anything —
this is here so you don't have to remember how it's wired.

## Where things live

| Piece | Service | What it does |
|---|---|---|
| The app | **Render** (free web service) | Runs the site, deploys from GitHub |
| The database | **Neon** (free Postgres) | Stores captured requests |
| The code | **GitHub** `porhour-ly/webhook-catcher` | Source of truth; Render deploys from here |

- **Live site:** https://webhook-catcher-ws6m.onrender.com
- **Webhook URLs** look like `https://webhook-catcher-ws6m.onrender.com/hooks/<project-slug>`

## Day-to-day: nothing to do

- **Old requests clean themselves up.** Anything older than 30 days is deleted automatically
  (daily, and once each time the app wakes). Change the window by setting `RETENTION_DAYS` in
  Render's environment settings.
- **No servers to manage.** Render and Neon run it for you.

## The one quirk: first load after idle is slow

On the free tier the app **sleeps after ~15 minutes** of no traffic. The next request (a webhook
or a page visit) **wakes it, taking ~30–60 seconds**. Just wait and refresh. If a sender ever
misses a webhook because of this, that's the signal to upgrade Render to an always-on plan
(a few dollars/month).

## Deploying changes

You don't deploy manually. **Push to the `main` branch on GitHub → Render rebuilds and deploys
automatically** within a minute or two. To confirm, watch **Render → your service → Events/Logs**.

## Changing the dashboard password

1. Render → your service → **Environment**
2. Edit **`DASHBOARD_PASSWORD`** → **Save**
3. The app redeploys and everyone is logged out (they log back in with the new password).

The password is **only** stored in Render's environment — never in the code or GitHub. Keep a
copy in a password manager.

## When something looks broken

**First move, always:** Render → your service → **Logs**. Errors show up there in plain text.
Copy anything that looks like an error and you'll usually be able to fix it from that alone.

- **"Not Found" right after visiting:** almost always the app waking from sleep. Wait ~30–60s
  and refresh.
- **Database errors:** log into **Neon** and check the project/database is active (the free tier
  can pause after long inactivity, then auto-wakes).

## Costs

Free at this usage level. Neither Render nor Neon needs a credit card. You'd only pay if you
choose to upgrade (e.g., to remove the cold-start delay).

## Important reminders

- **Staging/dev only.** Never point production traffic or real client data at this tool.
- **Treat webhook URLs and the password like secrets.** Don't paste them in public repos or
  wide-visibility channels — anyone with the URL can send to it, and anyone with the password
  sees everything.
