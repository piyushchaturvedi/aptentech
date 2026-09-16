# Deploy on merge

Merging to `main` deploys. No FileZilla, no SSH, no restart.

```
merge to main  →  GitHub Actions  →  ssh into EC2  →  git reset --hard  →  migrate  →  build  →  pm2 reload
```

The build runs **on the server**, not in Actions. Next.js compiles through platform-specific
binaries (`next-swc`, `esbuild`), so artifacts built on a GitHub runner are the same
wrong-platform problem as uploading `node_modules` from Windows. The server already has the
swap and heap settings the build needs.

`pm2 startOrReload` replaces the processes without dropping the port, so a deploy does not take
the site down and nothing has to be restarted by hand.

---

## What never travels through Git

| | Where it lives | Why |
| --- | --- | --- |
| `apps/api/.env`, `apps/web/.env.local` | only on the server | secrets; `.gitignore` covers them, and `git reset --hard` leaves untracked files alone |
| Uploaded media | `/var/www/aptentech/media` | outside the code tree, so a deploy cannot delete it |
| MongoDB data | the database | the seed runs only when the database is empty |

A deploy therefore cannot leak a secret into the repository, and cannot wipe uploads or content.

---

## One-time setup

Four steps, once. After this, merging is the whole workflow.

### 1 · Make the server directory a real clone

It is currently a copy that arrived over FTP, so it has no Git history to pull into.

If the repository is **private**, give the server a read-only key first:

```bash
ssh-keygen -t ed25519 -C "aptentech-server" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub
```

Paste that public key at **GitHub → the repo → Settings → Deploy keys → Add deploy key**.
Leave *Allow write access* unchecked — the server only ever reads.

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/github_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
```

Then convert the directory. Nothing untracked is touched, so `.env` and `node_modules` survive:

```bash
cd ~/aptentech
git init
git remote add origin git@github.com:piyushchaturvedi/aptentech.git
git fetch origin main
git reset --hard origin/main
git branch -M main
git branch --set-upstream-to=origin/main main
```

For a **public** repository, use `https://github.com/piyushchaturvedi/aptentech.git` as the
remote and skip the key entirely.

Confirm your environment survived — both must still print a line:

```bash
ls -l apps/api/.env apps/web/.env.local
```

### 2 · Let GitHub Actions in

A second key, separate from the first: this one is for Actions to reach the server, and it is
the only private key that leaves the machine.

```bash
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/gha_deploy -N ""
cat ~/.ssh/gha_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/gha_deploy
```

That last command prints the **private** key. It goes into GitHub Secrets in the next step and
nowhere else — not into the repository, not into a message, not into a file on your laptop.

Keeping it separate from your own `.pem` matters: if a workflow is ever compromised you revoke
one line from `authorized_keys` and your own access is unaffected.

### 3 · Add the secrets

**GitHub → the repo → Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
| --- | --- |
| `DEPLOY_HOST` | the server's Elastic IP |
| `DEPLOY_USER` | `ec2-user` |
| `DEPLOY_SSH_KEY` | the entire private key from step 2, including the `BEGIN`/`END` lines |
| `DEPLOY_PATH` | `/home/ec2-user/aptentech` |
| `DEPLOY_SITE_URL` | `http://3.218.41.249` — or the domain once it is live |
| `SMTP_PASSWORD` | the mailbox password for `sales@aptentech.com` |

`SMTP_PASSWORD` is the only mail setting kept as a secret. The host, port, TLS mode and mailbox
address are in `scripts/apply-mail-env.js`, which the deploy runs — none of those is a
credential, and keeping them in the repository is what lets a deploy configure mail on its own.
The password stays out because Git history is permanent: one committed and later deleted is
still in every clone and every fork.

`DEPLOY_SITE_URL` is only used by the final check that the site answers. Update it when you move
to the domain, otherwise a perfectly good deploy reports failure.

### 4 · Push

```bash
git add .github scripts/ci-deploy.sh docs/CICD-SETUP.md
git commit -m "Deploy on merge to main"
git push origin main
```

Watch it under the repository's **Actions** tab. The first run is the slow one — a cold
`npm ci` plus two builds.

---

## After that

```bash
git checkout -b my-change
# ...edit...
git commit -am "..."
git push origin my-change
```

Open a pull request, merge it, and the site updates. Redeploy the same commit from
**Actions → Deploy → Run workflow** when a deploy failed for a reason outside the code.

To deploy by hand, from the server, the CI job's exact steps:

```bash
cd ~/aptentech && bash scripts/ci-deploy.sh main
```

---

## Things worth knowing before the first merge

**A merge is a live change.** There is no staging step between the pull request and the public
site. If that becomes uncomfortable, point a second EC2 instance at a `staging` branch and give
it its own workflow file — the scripts take the branch as an argument already.

**Migrations run before the build**, from `scripts/ci-deploy.sh`. Each is idempotent and prints
`0` when there is nothing to do. A change to a stored shape needs its migration added to that
list in the same commit, or the deploy that ships the code will build against documents in the
old shape.

**`sudo` must not prompt.** The deploy writes the nginx config and creates directories. On
Amazon Linux `ec2-user` has passwordless sudo by default; if that was changed, the SSH session
hangs instead of failing. Check with:

```bash
sudo -n true && echo "sudo ok"
```

**A failed deploy leaves the previous version running.** The script only reloads PM2 after the
build succeeds, so a build error stops the deploy with the old site still serving.
