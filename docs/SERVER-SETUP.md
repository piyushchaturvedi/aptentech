# EC2 server setup — Amazon Linux 2023

Step-by-step commands for the instance you already have running
(`ec2-3-94-246-68.compute-1.amazonaws.com`, Amazon Linux 2023, `us-east-1`).

Run everything after step 1 **on the server**, over SSH. Commands marked *(local)* run on your
Windows machine instead.

> A note on what this deploys. `npm run preflight` currently reports blockers — demo awards,
> demo testimonials, and `hello@example.com` as the company address. The server can be built
> and started with those in place, but do not point the domain at it until they are resolved.
> Step 10 covers that.

---

## Quick path — one command

Everything below is also available as a single command. Upload the code, then:

```bash
cd /var/www/aptentech/aptentech-platform
SITE_URL=http://your-server-ip npm run deploy:prod
```

It writes both env files, installs, builds the shared package, the API and the site, starts
both under PM2, registers PM2 with systemd so they come back after a reboot, installs and
reloads nginx, then verifies the site, the admin and the API through nginx. Pass `SITE_URL`
only the first time — it is stored. Nothing about it is destructive: it never drops or deletes
data, and the content seed runs only when the database is empty.

Two things it cannot invent and will stop for: `MONGODB_URI`, and the SMTP credentials if you
want mail. Section 6 and section 7 cover those.

The manual steps below are what it does, in case one needs doing by hand.

Afterwards, one command controls both apps:

```bash
pm2 restart all
```

---

## 1. Connect *(local)*

```powershell
icacls "aptentech.pem" /inheritance:r /grant:r "%USERNAME%:R"
```

OpenSSH refuses a key that other accounts can read, so lock it down first. Then:

```powershell
ssh -i "aptentech.pem" ec2-user@ec2-3-94-246-68.compute-1.amazonaws.com
```

Keep this session open — everything below runs in it.

---

## 2. Check the instance has enough memory

```bash
free -h && nproc && df -h /
```

The Next.js build needs roughly 2 GB. If `free -h` shows less than that, add swap — a build
that runs out of memory is killed by the kernel and reports a confusing error rather than
"out of memory":

```bash
sudo dd if=/dev/zero of=/swapfile bs=128M count=16 status=progress
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

---

## 3. Install Node.js 20, nginx and git

```bash
sudo dnf update -y
sudo dnf install -y nodejs20 nodejs20-npm nginx git tar
```

Amazon Linux installs this namespaced, so the binaries are `node-20` and `npm-20` rather than
`node` and `npm`. Link them, or every later command has to be renamed:

```bash
sudo alternatives --install /usr/bin/node node /usr/bin/node-20 90
sudo alternatives --install /usr/bin/npm npm /usr/bin/npm-20 90
node --version && npm --version
```

`node --version` must print v20.10 or higher — the project refuses to run below that.

---

## 4. Create the application directory

```bash
sudo mkdir -p /var/www/aptentech
sudo chown -R ec2-user:ec2-user /var/www/aptentech
```

---

## 5. Upload the code *(local)*

The project is not a git repository, so copy it directly. Build artefacts and dependencies are
excluded — they are rebuilt on the server and would make the upload many times larger:

```powershell
cd D:\Arpit\AptenTech
tar --exclude=node_modules --exclude=.next --exclude=dist --exclude=.env --exclude=.env.local -czf aptentech.tar.gz aptentech-platform *.html
scp -i "aptentech.pem" aptentech.tar.gz ec2-user@ec2-3-94-246-68.compute-1.amazonaws.com:/var/www/aptentech/
```

The 25 source HTML files go too: the seed reads them to build the site's content.

Back on the server:

```bash
cd /var/www/aptentech
tar -xzf aptentech.tar.gz && rm aptentech.tar.gz
ls
```

---

## 6. Database

The application talks to MongoDB only through the API, so the database does not need to be on
this server. A **MongoDB Atlas free cluster** is the recommended option — it is managed, backed
up, and free at this size.

1. Create a free M0 cluster at <https://cloud.mongodb.com>, in **AWS / us-east-1** so it sits
   beside this instance.
2. Add a database user.
3. Under **Network Access**, allow this server's public IP (`3.94.246.68`).
4. Copy the connection string — it looks like
   `mongodb+srv://user:password@cluster.mongodb.net/?retryWrites=true&w=majority`.

<details>
<summary>Or install MongoDB on this server instead</summary>

Amazon Linux 2023 has no MongoDB package, so add MongoDB's own repository:

```bash
sudo tee /etc/yum.repos.d/mongodb-org-7.0.repo >/dev/null <<'EOF'
[mongodb-org-7.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/9/mongodb-org/7.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-7.0.asc
EOF

sudo dnf install -y mongodb-org
sudo systemctl enable --now mongod
```

The connection string is then `mongodb://127.0.0.1:27017`. You are responsible for backups —
which is the reason Atlas is recommended.
</details>

---

## 7. Environment

```bash
cd /var/www/aptentech/aptentech-platform
node -e "const c=require('crypto');console.log('API_SERVICE_TOKEN='+c.randomBytes(32).toString('base64url'));console.log('SESSION_SECRET='+c.randomBytes(32).toString('base64url'));console.log('REVALIDATE_SECRET='+c.randomBytes(24).toString('base64url'))"
```

Copy those three lines somewhere for a moment, then:

```bash
cp .env.production.example apps/api/.env
nano apps/api/.env
```

Fill in, at minimum:

| Key | Value |
| --- | --- |
| `MONGODB_URI` | the Atlas string from step 6 |
| `API_SERVICE_TOKEN`, `SESSION_SECRET`, `REVALIDATE_SECRET` | the three generated above |
| `PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_URL`, `WEB_ORIGIN` | `http://3.94.246.68` while there is no domain |
| `REVALIDATE_URL` | `http://127.0.0.1:3000/api/revalidate` — stays on the loopback rather than going out and back |
| `TRUST_PROXY` | `true` — nginx sits in front |

**`http://`, not `https://`, until the certificate exists.** Two things key off that scheme:
the session cookie sets `secure` only when the site is served over TLS, and the CSP only sends
`upgrade-insecure-requests` then. Writing `https://` before there is a certificate makes the
admin impossible to sign in to and every asset fail to load — with no error that says why.
Change all four to `https://your-domain.com` at the same time as running certbot.

Two settings the API refuses to start on until you decide:

```bash
# No S3 bucket yet — uploads live on this instance's disk. Acceptable here because EBS
# survives a reboot; move to S3 before you ever run a second instance.
MEDIA_DRIVER=local
ALLOW_LOCAL_MEDIA=true

# No mail configured yet. Leads are still saved and visible in the admin; nobody is emailed.
EMAIL_DRIVER=log
ALLOW_NO_EMAIL=true
```

Then copy the same file to the web app — the two must agree on `API_SERVICE_TOKEN` and
`REVALIDATE_SECRET` or the site renders every page empty:

```bash
cp apps/api/.env apps/web/.env.local
```

---

## 8. Install, build, seed

```bash
cd /var/www/aptentech/aptentech-platform
npm ci
```

The build reads content from the API over HTTP, so start the API first:

```bash
npm run build --workspace @aptentech/shared
npm run build --workspace @aptentech/api
node apps/api/dist/server.js &
sleep 8
curl -s -o /dev/null -w "api %{http_code}\n" http://127.0.0.1:4000/health
```

Load the content, then build the site:

```bash
export SOURCE_HTML_DIR=/var/www/aptentech
npm run seed
npm run build --workspace @aptentech/web
```

Stop the temporary API — PM2 takes over next:

```bash
kill %1
```

---

## 9. Run both apps under PM2 — one command for both

PM2 is the process supervisor. One command starts both apps, and it is the same command used
for every later deploy:

```bash
cd /var/www/aptentech/aptentech-platform
SITE_URL=http://your-server-ip npm run deploy:prod
```

Two processes rather than one, so each restarts on its own and each keeps its own log; a single
process running both would lose both.

From here on:

```bash
pm2 status           both processes, memory, restart count
pm2 restart all      restart both
pm2 logs             follow both
pm2 logs aptentech-api --lines 50
```

### Staying up permanently

Three different failures, three different mechanisms — the deploy sets all three up:

| If | What brings it back |
| --- | --- |
| you close the SSH session | PM2 runs both under its own daemon, detached from your shell |
| a process crashes or leaks memory | `autorestart`, plus a 400 MB ceiling so one leak cannot OOM a 1 GB instance |
| the server reboots | `pm2-<user>.service`, installed by `pm2 startup` under sudo, which replays the list saved by `pm2 save` |

The reboot one is the easy one to get wrong: `pm2 startup` run *without* sudo only prints the
command to install the unit, it installs nothing. Confirm it is really in place:

```bash
systemctl is-enabled pm2-$USER
```

That must print `enabled`. `mongod` and `nginx` need the same treatment, and the deploy
enables them too:

```bash
systemctl is-enabled mongod nginx
```

The honest test is the real one:

```bash
sudo reboot
```

Wait a minute, reconnect, and `pm2 status` should show both processes online without you
having started anything.

> Do **not** also install `deploy/aptentech-*.service`. Those units are superseded; with both
> supervisors enabled, each boot starts two copies that race for ports 3000 and 4000.
> `npm run deploy:prod` disables them if an earlier run installed them.

Check:

```bash
curl -s -o /dev/null -w "api %{http_code}
" http://127.0.0.1:4000/health
curl -s -o /dev/null -w "web %{http_code}
" http://127.0.0.1:3000/
```

---

## 10. First admin, and the content that must not go live

```bash
cd /var/www/aptentech/aptentech-platform
npm run create-admin -- --email you@aptentech.com --name "Your Name" --role SUPER_ADMIN
```

**Copy the printed password now** — it is stored only as a hash and cannot be read back.

Then clear the demo content. None of it is publishable: the awards, testimonials and
case-study metrics are claims about the company that nobody verified, and a visitor cannot
tell them from real ones.

```bash
npm run clear-demo            # shows what it would change
npm run clear-demo -- --apply # hides it — reversible from the CMS later
```

Set the real company email and phone in the admin under **Settings → Company**; there is no
switch for those, they need real values.

Finally:

```bash
npm run preflight
```

Fix anything it still reports as a BLOCKER before pointing the domain here.

---

## 11. nginx

```bash
cd /var/www/aptentech/aptentech-platform
sudo cp deploy/nginx.conf /etc/nginx/conf.d/aptentech.conf
sudo nginx -t
sudo systemctl enable --now nginx
```

It listens on `server_name _`, which matches anything — that is what lets the site answer on
the bare IP before a domain exists. `/uploads/` is proxied to the API, which serves media from
this instance’s disk while `MEDIA_DRIVER=local`.

In the **EC2 security group**, open only **80**, **443** and **22** (SSH restricted to your own
IP). Ports 3000 and 4000 must stay closed — nginx reaches them over the loopback.

The site is now live at **http://3.94.246.68/**, admin at **http://3.94.246.68/admin**.

---

## 12. Domain and HTTPS

Point an **A record** for your domain at `3.94.246.68`. Give DNS a few minutes, confirm it
resolves, then:

```bash
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
sudo systemctl enable --now certbot-renew.timer
```

Certbot edits the nginx file to add the certificate and the HTTP→HTTPS redirect.

**Then switch the URLs over and rebuild.** The scheme in `PUBLIC_SITE_URL` decides whether the
session cookie is marked `secure` and whether the CSP upgrades requests to HTTPS, and both are
fixed at build time — so changing the certificate without changing these leaves the site on
the weaker settings:

```bash
cd /var/www/aptentech/aptentech-platform
SITE_URL=https://your-domain.com npm run deploy:prod
```

Passing the new address is all that is needed — it rewrites those three variables in both env
files, rebuilds against them and restarts. Every secret already in the files is preserved.

> Use an **Elastic IP**. A stopped instance gets a new public address on restart, and the DNS
> record would then point at nothing.

---

## 13. Verify

```bash
cd /var/www/aptentech/aptentech-platform
node scripts/verify-links.js
node scripts/verify-placeholders.js
node scripts/verify-parity.js
```

Then open `https://your-domain.com/` and `https://your-domain.com/admin`.

---

## Redeploying after a change

Same command as the first deploy — `SITE_URL` is already stored, so it is just:

```bash
cd /var/www/aptentech/aptentech-platform
npm run deploy:prod
```

It restarts the API *before* building the site, because the build reads its content from the
API over HTTP; building against a stopped or stale API silently bakes the wrong content into
the pages. Content edited in the CMS reaches the running site without any of this — only a
code change needs a rebuild.
