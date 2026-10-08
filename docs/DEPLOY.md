# Putting the app online (Railway)

This puts the app on the internet at its own address, so you can use it from any computer or phone.
It takes about 20 minutes. [Railway](https://railway.com) is used here because it runs the app's
Docker setup directly and includes a database. Expect roughly **$5–15 a month**.

You'll need: the GitHub account that has the `shul` repository, and a credit card for Railway.

## 1. Create the project

1. Go to **railway.com** and sign up with your GitHub account.
2. Click **New Project → Deploy from GitHub repo** and choose **shul**.
   If it isn't listed, click *Configure GitHub App* and give Railway access to the repository.
3. Railway starts a first build. It will fail until the next steps are done. That's expected.
4. Open the new service, go to **Settings → Source**, and set the branch to
   `claude/shul-communications-platform-up2m8h` (or `main` once the work is merged there).

## 2. Add the database

1. In the project, click **+ Create → Database → PostgreSQL**.
2. Open the app service (not the database) → **Variables** → **New Variable**:
   - Name `DATABASE_URL`, value `${{Postgres.DATABASE_URL}}`
     (Railway fills in the real address).

## 3. Add the other settings

Still in the app service's **Variables**, add:

| Name | Value |
|---|---|
| `APP_PASSWORD` | The password you'll sign in with. Make it long. |
| `SESSION_SECRET` | Any random string of 40+ letters and numbers (mash the keyboard, or use a password generator). |

## 4. Keep uploaded images

Uploaded images (logo, flyers, sponsor pictures) must survive restarts:

1. Right-click the app service → **Attach Volume**.
2. Mount path: `/data`

## 5. Give it an address

1. App service → **Settings → Networking → Generate Domain**. You'll get something like
   `shul-production.up.railway.app`.
2. Back in **Variables**, add `PUBLIC_BASE_URL` = `https://shul-production.up.railway.app`
   (your address, with `https://`, no slash at the end). Emails use this for image links.
3. Railway redeploys automatically. When the deployment shows **Active**, open the address.

The first start creates the database tables and the shul's starting settings by itself.

## 6. First-time setup in the app

1. **Sign in** with your `APP_PASSWORD`.
2. **Settings:** upload the shul's real logo (a PNG with a transparent background is best), and check the
   address, phone and email, the sponsor note and the newsletter name.
3. **Davening Profiles:** the starting profile is *Summer 5786* (the Ki Savo times). For the winter:
   *New profile → Copy rows from Summer 5786*, name it *Winter 5787*, change the times, tick **Default**.
4. **Yahrzeits & Birthdays:** paste each spreadsheet once.
5. **Weeks → Open week**, check the times against Chabad.org for the first couple of weeks, add the week's
   content, then **View outputs**.

## Updating later

Every time new work is pushed to the branch, Railway rebuilds and redeploys by itself. Your data,
images and settings are kept.

## If something goes wrong

- **Deployment fails:** app service → **Deployments** → open the failed one → **View logs**. Copy the last
  lines into a message to your developer or to Claude.
- **"DATABASE_URL is not set" in the logs:** step 2 was missed or the variable name is misspelled.
- **Images missing in Mailchimp:** check `PUBLIC_BASE_URL` (step 5).
- **Forgot the password:** change `APP_PASSWORD` in Variables. Railway redeploys with the new one.

## Other hosts

The app is a standard Docker image (see `Dockerfile`) that needs PostgreSQL 16, a persistent volume at
`/data`, and the variables above. It runs the same on Render, Fly.io, or a small VPS.
