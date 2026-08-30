# Deployment and cost

> **Pricing verified 30 August 2026** against the official AWS and MongoDB documentation
> cited below. AWS restructured both its free tier and CloudFront pricing during 2025, so
> older guidance is misleading. **Re-check every figure before you commit** — these change.

## The finding that changes the plan

Two things are materially different from how AWS worked a couple of years ago, and both
affect this deployment:

**1. The AWS "Free" account plan closes your account.** New accounts choose a Free or Paid
plan. The Free plan expires at the earlier of six months from signup or when the credits run
out, and **the account is then closed** — AWS retains data for 90 days before permanent
deletion. Credits are $100 on signup plus up to $100 for completing activities, and expire
12 months after account creation.

That makes the free plan a sandbox, not a hosting strategy. **Use a Paid account plan for
aptentech.com from day one** and treat the credits as a discount on the first months' bills.
Running a business website on a plan that deletes itself is not a cost saving.

**2. CloudFront now sells flat-rate plans**, and the Free tier of that plan is genuinely
useful. One plan covers one distribution with one apex domain and bundles:

- CloudFront CDN
- **AWS WAF and DDoS protection**
- Bot management and analytics
- **Route 53 DNS**
- CloudWatch Logs ingestion
- TLS certificate
- Serverless edge compute
- Monthly S3 storage credits

| Plan | Requests / month | Data transfer / month |
| --- | --- | --- |
| **Free** | 1 M | 100 GB |
| Pro | 10 M | 50 TB |
| Business | 125 M | 50 TB |
| Premium | 500 M ($1,000/mo) | 50 TB |

Allowances are not hard limits and **there are no overage charges** — sustained excess is
handled by adjusting delivery, not by billing surprises.

This changes earlier advice. WAF was previously something to avoid as unnecessary cost; in
the flat-rate plan it comes with the CDN you want anyway. At AptenTech's launch traffic, the
Free plan covers the site outright, and Pro is the upgrade when 1M requests/month is
exceeded.

---

## Option A — recommended for launch

| Service | Purpose | Cost | Notes |
| --- | --- | --- | --- |
| **Lightsail 2 GB** | Next.js + Node API | **$12/mo** | 2 vCPU, 60 GB SSD, 3 TB transfer. Fixed price — the main reason to prefer it over EC2. |
| **CloudFront flat-rate Free** | CDN, WAF, DDoS, DNS, TLS | **$0** | 1M requests, 100 GB/mo. No overage charges. |
| **MongoDB Atlas Free cluster** | Database | **$0** | 512 MB storage, 500 connections, ~100 ops/sec, one per project. |
| **S3** | Media storage | **<$1/mo** | Private bucket, served via CloudFront OAC. Plan includes S3 credits. |
| **Amazon SES** | Lead notification email | **<$1/mo** | Charged per 1,000 messages. |
| **SSM Parameter Store** | Secrets | **$0** | Standard tier is free; Secrets Manager charges per secret per month. |
| **CloudWatch Logs** | Logging | **$0–2/mo** | Included in the CloudFront plan allowance. Keep 7–14 day retention. |

**Estimated: roughly $13–15/month.**

Lightsail is chosen over EC2 deliberately. It is a fixed monthly price with data transfer
included, which means no surprise bill — the single most common way small AWS deployments go
wrong. EC2 is cheaper only once you are managing reserved instances, and it bills data
transfer separately.

### Why not…

- **ECS / EKS / Kubernetes** — two processes and a managed database. Container orchestration
  solves a problem this does not have.
- **NAT Gateway** — roughly $32/month plus data processing, more than the entire rest of this
  stack. A public subnet with a security group is correct at this size.
- **RDS / Aurora / DocumentDB** — MongoDB is the database; Atlas manages it better and the
  free tier genuinely fits this content.
- **ElastiCache** — Next.js ISR is the cache. A page view does not reach the database.
- **Amplify** — viable, and simpler to operate, but it bills per build minute and per SSR
  request, which is less predictable than Lightsail's fixed price. Reasonable if you would
  rather not manage a server.

### Sizing note

Atlas's free cluster is 512 MB with ~100 ops/sec. The seeded content is a few megabytes, and
leads are small documents — this fits comfortably. Upgrade to **M10 (~$57/mo)** when you
need automated backups, which you will want once real lead data is accumulating. That is the
first upgrade to plan for, and it is about data safety rather than capacity.

---

## Option B — when traffic justifies it

The application is already shaped for this: a stateless Next.js app, a stateless API and a
managed database. Moving is a deployment change, not a rewrite.

1. **CloudFront Pro plan** — 10M requests, 50 TB.
2. **ECS Fargate** for the API behind an ALB, so it scales horizontally. At that point move
   rate limiting to Redis, or each instance enforces its own separate budget.
3. **Atlas M10+** with a replica set.
4. **Multi-AZ** and read replicas when database load justifies them.

Do none of this until measurements say so.

---

## Deploying

### 1. Database

Create an Atlas project and a Free cluster. Then:

- Create a database user with `readWrite` on the `aptentech` database only — not an admin
  user.
- Restrict network access to the Lightsail instance's static IP. Do not use `0.0.0.0/0`.
- Copy the SRV connection string into `MONGODB_URI`.

### 2. Media

```
S3 bucket (private, all public access blocked)
   └── CloudFront distribution with Origin Access Control
```

Never make the bucket public. Set `MEDIA_DRIVER=s3`, `S3_BUCKET`, and `S3_PUBLIC_BASE_URL`
to the CloudFront domain. Prefer an IAM role attached to the instance over long-lived access
keys.

### 3. Application

On the Lightsail instance:

```bash
git clone <repo> && cd aptentech-platform
npm install
cp .env.example .env      # fill in production values
npm run build
```

Run both processes under a supervisor (PM2 or systemd) so they restart on failure and on
reboot:

```bash
npm run start
```

Then:

```bash
npm run seed              # first deploy only
npm run create-admin -- --email you@aptentech.com --name "Your Name" --role SUPER_ADMIN
```

Put nginx in front, terminating TLS and proxying `/` to port 3000. The API on port 4000
should **not** be exposed to the internet — only Next.js needs to reach it.

### 4. Production environment

```bash
NODE_ENV=production
TRUST_PROXY=true                        # only because nginx is in front
MEDIA_DRIVER=s3
NEXT_PUBLIC_SITE_URL=https://aptentech.com
WEB_ORIGIN=https://aptentech.com
REVALIDATE_URL=https://aptentech.com/api/revalidate/
```

The API refuses to start in production with placeholder secrets or `MEDIA_DRIVER=local`.

### 5. Domain

Point `aptentech.com` at CloudFront. Redirect `www` → apex at the DNS/CDN layer: every
canonical the site publishes uses the apex host, so serving both would split ranking signals
between two URLs for the same page.

---

## Cost control — do this before deploying, not after

1. **AWS Budgets**: a monthly budget with alerts at 50%, 80% and 100% of a $50 threshold.
2. **Free-tier usage alerts** in Billing preferences.
3. **CloudWatch Logs retention**: set 7–14 days on every log group. Unbounded retention is
   the most common quiet cost creep.
4. **Cost Anomaly Detection**: catches a misconfiguration before it becomes a month's bill.
5. **Billing alerts to a monitored address**, not one nobody reads.

### What can generate charges

| Service | Risk | Mitigation |
| --- | --- | --- |
| Lightsail | Fixed | None — that is the point |
| CloudFront flat-rate | None (no overages) | Monitor the allowance; upgrade if consistently exceeded |
| S3 | Storage growth | Lifecycle rules; delete unused media |
| Atlas | Cluster upgrade | Deliberate action, not accidental |
| CloudWatch | Log volume | Short retention |
| SES | Volume | Only sends on a real lead |

---

## Backups

Lead data is business-critical and is the one thing that cannot be regenerated.

- **Atlas Free clusters have no automated backups.** This is the strongest argument for
  M10 once real leads accumulate.
- Until then, run `mongodump` on a schedule to S3 with a lifecycle policy. Do not treat the
  seed as a backup — it restores content, not leads.
- Test a restore before you need one.
- Content is reproducible from `npm run seed`; media lives in S3 with versioning.

---

## Sources

- [AWS Free Tier FAQs](https://aws.amazon.com/free/free-tier-faqs/) — account plans, expiry, credits
- [AWS Free Tier update: up to $200 in credits](https://aws.amazon.com/blogs/aws/aws-free-tier-update-new-customers-can-get-started-and-explore-aws-with-up-to-200-in-credits/)
- [Amazon Lightsail pricing](https://aws.amazon.com/lightsail/pricing/)
- [CloudFront flat-rate pricing plans](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html)
- [Atlas free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)
