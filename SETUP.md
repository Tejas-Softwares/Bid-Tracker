# Putting the Tejas Bid Tracker online (Vercel + Neon)

This guide takes about 30 minutes and needs no programming. At the end, the bid team opens the tracker at a web address, each person signs in with their own email and password, and everyone sees the same bids.

You need:

- A **GitHub** account (free) to hold the code.
- A **Vercel** account to run the website. Sign up at vercel.com with "Continue with GitHub".
- A long **setup code** that only you know, for example `Tejas-Bids-Setup-7419-Kharadi`. You type it once to create the first admin account, and again only if an admin ever forgets their password.

---

## 1. Put the code on GitHub

1. Sign in at github.com. Press **+** (top right), then **New repository**.
2. Name it `tejas-bid-tracker`, choose **Private**, and press **Create repository**.
3. On the empty repository page, click **uploading an existing file**.
4. Unzip `tejas-bid-tracker.zip` on your computer. Open the unzipped folder, select **everything inside it** (the `api`, `lib`, `src` folders and the other files, not the outer folder itself) and drag it onto the GitHub page.
5. Press **Commit changes**.

> The folder has a hidden `.gitignore` file. If your computer hides it, that is fine; it only tells GitHub which files to skip.

## 2. Create the project on Vercel

1. In Vercel, press **Add New…** then **Project**.
2. Find `tejas-bid-tracker` in the list and press **Import**. (If it is not listed, press **Adjust GitHub App Permissions** and allow Vercel to see that repository.)
3. Leave **Framework Preset** as **Other**. The build settings come from the project itself; do not change them.
4. Open **Environment Variables** and add two:

   | Name | Value |
   |---|---|
   | `SETUP_CODE` | your long setup code |
   | `CRON_SECRET` | any 20 or more random letters and numbers (Vercel uses it to run the nightly backup) |

5. Press **Deploy**. After about a minute you get a web address like `tejas-bid-tracker.vercel.app`. Opening it now shows "The database is not connected yet". That is expected; the next step fixes it.

## 3. Add the database (Neon)

1. In the Vercel project, open the **Storage** tab and press **Create Database** (or **Browse Marketplace**).
2. Choose **Neon** (Serverless Postgres) and press **Continue**.
3. Pick the **Free** plan and the region **Singapore (aws-ap-southeast-1)**. The tracker's server also runs in Singapore, which is the closest to Pune that both offer.
4. Name the database `tejas-bids`, create it, and when asked which environments to connect, keep all of them ticked (Production, Preview, Development).
5. Go to the **Deployments** tab, open the menu (⋯) on the latest deployment, and press **Redeploy**. The database settings only reach the website after a redeploy.

## 4. Create the first admin account

1. Open the web address. You see **Set up the bid tracker**.
2. Enter the setup code, your name, position, email and a password. This account is the **admin**.
3. You are now in the tracker. Open **Settings, Companies and lists** and check the two company names and bid number prefixes (TEJ and TEP). Change them if needed.

## 5. Bring in the team

1. In **Settings, Team and access**, press **Copy address** and send the address to the bid team.
2. Each person opens it, chooses **Create an account**, and enters their name, position, work email and a password of their own.
3. You see a blue bar, "account waiting for your approval". Press **Review**, check it is the right person, and press **Approve**.
4. To give someone admin rights, change **Member** to **Admin** next to their name. Keep at least two admins, so one can always help the other.

When someone leaves, open the **⋯** menu next to their name and choose **Turn off this account**. Everything they did stays in the tracker with their name on it.

## 6. Move the bids you already have

**From the earlier one-file tracker (the shared OneDrive version):**

1. In the old tracker, go to **Settings, Sharing and backups** and press **Download backup**. You get a `.json` file.
2. In the new tracker, go to **Settings, Import, export and backups** and press **Restore from a backup file**.
3. Pick the file, choose **Add what is missing**, and press **Restore**. All bids, offers, notes and clients come across, with the names of the people who created them.

**From the Excel tracker:** in the same place press **Choose Excel file**, pick the workbook, and choose which company the bids belong to.

## 7. Your own web address (optional)

To use something like `bids.tejasgroup.in`:

1. In Vercel, open the project's **Settings, Domains**, type the address and press **Add**.
2. Vercel shows a **CNAME** record. Add it in your domain provider's DNS settings (GoDaddy, Hostinger or whoever manages tejasgroup.in).
3. Within an hour the tracker opens at the new address, with HTTPS. Send the team the new address; their accounts carry over.

## 8. What it costs

- **Vercel**: the free **Hobby** plan is only for personal, non-commercial use, so a company tracker should be on **Pro**, $20 a month for each person who manages the Vercel project (usually one). The bid team does not need Vercel accounts; they only sign in to the tracker. Upgrade from the Vercel dashboard (**Settings, Billing**).
- **Neon**: the **Free** plan gives 1 GB of storage and 100 compute hours a month. A bid tracker uses a few megabytes, so the free plan should be enough for years. The database pauses when nobody has used it for a few minutes; the first page load after that can take a second or two longer.

Check the current prices on vercel.com/pricing and neon.com/pricing before deciding.

## 9. Backups and safety

- The server keeps a copy of everything **every night** (about 2 am India time) and keeps 90 days of them. It also saves one just before anyone restores a backup or deletes everything.
- Admins see the backups under **Settings, Import, export and backups**, and can download or restore any of them.
- Once a month, an admin should press **Download a backup file** and keep it in the company OneDrive. That copy is independent of Vercel and Neon.
- Every action is recorded on the **Activity** screen with the person's name and email for **90 days**, then removed. A deleted bid can be brought back from there by an admin while that entry is still kept.
- Passwords are stored scrambled (scrypt); nobody, including admins, can read them. After 5 wrong passwords, an email is locked for 15 minutes.

## 10. If something goes wrong

| What you see | What to do |
|---|---|
| "The database is not connected yet" | Step 3 was skipped or not followed by a redeploy. Add Neon, then **Redeploy**. |
| "Add a SETUP_CODE environment variable" | Add `SETUP_CODE` in **Settings, Environment Variables**, then **Redeploy**. |
| "That setup code is not right" | Type it exactly as saved in Vercel (capitals count). After changing it in Vercel you must **Redeploy**. |
| A team member forgot their password | An admin opens **Settings, Team and access**, the **⋯** menu next to the person, **Make a password reset link**, and sends them the link. It works once, for 24 hours. |
| The only admin forgot their password | On the sign-in screen, press **Use the setup code** under "Admin locked out?", enter the setup code, the admin email and a new password. |
| "Too many wrong attempts" | Wait 15 minutes, or use a reset link. |
| The site is slow to open in the morning | The free database was paused overnight; it wakes in a second or two. |

## For a developer later

- `src/` is the app (plain JavaScript, no framework), built by `build.mjs` with esbuild into `public/`.
- `api/` holds the server functions; `lib/` the shared code (database, sign-in, activity log, records).
- `npm run dev` runs everything on your computer at http://localhost:3000 with a built-in database (no Neon needed). Setup code there: `dev-setup`.
- `npm test` builds the app and runs the end-to-end tests in Chromium (needs Playwright).
- Pushing to the `main` branch on GitHub redeploys the site automatically.
