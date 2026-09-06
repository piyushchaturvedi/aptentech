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

## Quick path — scripted

Everything below is also available as one script. Upload the code, write `apps/api/.env`
(step 7), then:

```bash
cd /var/www/aptentech/aptentech-platform
bash deploy/first-time-setup.sh
```

It sets up swap, installs Node and nginx, builds, seeds, installs the systemd units and starts
everything — and it is idempotent, so re-running after a failure picks up rather than
duplicating work. The manual steps below are what it does, in case a step needs doing by hand.

Afterwards, one command controls both apps:

```bash
sudo systemctl restart aptentech.target
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

Stop the temporary API — systemd takes over next:

```bash
kill %1
```

---

## 9. Run both apps under systemd — one command for both

The unit files are in the repository, so they are version-controlled rather than typed in:

```bash
cd /var/www/aptentech/aptentech-platform
sudo cp deploy/aptentech-api.service deploy/aptentech-web.service deploy/aptentech.target /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable aptentech-api aptentech-web aptentech.target
sudo systemctl start aptentech.target
```

`aptentech.target` groups the two services, so from here on **one command controls both**:

```bash
sudo systemctl restart aptentech.target
sudo systemctl status  aptentech.target
sudo systemctl stop    aptentech.target
```

A target rather than a single process running both: each service still restarts on its own
when it crashes, and each keeps its own log. Running them under one process would lose both.

Check:

```bash
curl -s -o /dev/null -w "api %{http_code}
" http://127.0.0.1:4000/health
curl -s -o /dev/null -w "web %{http_code}
" http://127.0.0.1:3000/
```

Follow both logs together:

```bash
journalctl -u aptentech-api -u aptentech-web -f
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
nano apps/api/.env    # PUBLIC_SITE_URL, NEXT_PUBLIC_SITE_URL, WEB_ORIGIN → https://your-domain.com
cp apps/api/.env apps/web/.env.local
bash deploy/redeploy.sh
```

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

```bash
cd /var/www/aptentech/aptentech-platform
npm ci
npm run build --workspace @aptentech/shared
npm run build --workspace @aptentech/api
sudo systemctl restart aptentech-api
sleep 5
npm run build --workspace @aptentech/web
sudo systemctl restart aptentech-web
```

The API restarts before the web build because the build reads its content over HTTP. Content
edited in the CMS reaches the running site without any of this — only a code change needs a
rebuild.
