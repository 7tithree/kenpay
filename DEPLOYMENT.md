# Deploying KenPay to AWS

Recommended stack: **RDS PostgreSQL** (database) + **App Runner** (app, from a container image in ECR) + **SES** (payslip email). This is the lowest-ops path; an ECS/Fargate variant is noted at the end.

## 0. Prerequisites
- AWS CLI configured (`aws configure`), Docker installed
- A region choice (examples use `eu-west-1`)

## 1. Database — RDS PostgreSQL

1. RDS → Create database → PostgreSQL 16, **db.t4g.micro** (start small), storage autoscaling on.
2. Set master username/password. Note the endpoint.
3. Networking: place it in your default VPC, **no public access**. Create a security group `kenpay-db` allowing inbound 5432 only from the App Runner VPC connector's security group (step 3).
4. Your `DATABASE_URL`:
   ```
   postgresql://USER:PASSWORD@your-endpoint.rds.amazonaws.com:5432/kenpay
   ```
5. Create the schema once from your machine (temporarily allow your IP, or use a bastion):
   ```bash
   DATABASE_URL="postgresql://..." npx prisma migrate deploy
   DATABASE_URL="postgresql://..." npm run db:seed   # optional demo data
   ```
   > Ongoing schema changes: `npm run db:migrate` locally to create a migration, `npx prisma migrate deploy` on release. Don't use `prisma db push` — it bypasses migration history.

## 2. Container image — ECR

```bash
aws ecr create-repository --repository-name kenpay --region eu-west-1
aws ecr get-login-password --region eu-west-1 \
  | docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.eu-west-1.amazonaws.com

docker build -t kenpay .
docker tag kenpay:latest ACCOUNT_ID.dkr.ecr.eu-west-1.amazonaws.com/kenpay:latest
docker push ACCOUNT_ID.dkr.ecr.eu-west-1.amazonaws.com/kenpay:latest
```

## 3. App — App Runner

1. App Runner → Create service → **Container registry / Amazon ECR** → pick `kenpay:latest`, enable automatic deployments.
2. Port: `3000`. CPU/memory: 1 vCPU / 2 GB is plenty to start.
3. **Networking**: add a **VPC connector** into the same VPC/subnets as RDS. Attach a security group `kenpay-app`; then edit `kenpay-db` to allow 5432 from `kenpay-app`.
4. Environment variables:
   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the RDS URL above |
   | `AUTH_SECRET` | long random string (`openssl rand -base64 48`) |
   | `SMTP_HOST` | `email-smtp.eu-west-1.amazonaws.com` |
   | `SMTP_PORT` | `587` |
   | `SMTP_USER` / `SMTP_PASS` | SES SMTP credentials (step 4) |
   | `MAIL_FROM` | `Acme Payroll <payroll@yourdomain.co.ke>` |
   > Store secrets in AWS Secrets Manager and reference them from App Runner rather than pasting values.
5. Health check path: `/login`. Deploy; App Runner gives you an HTTPS URL. Add a custom domain under **Custom domains** if you have one.

## 4. Payslip email — SES

1. SES → Verified identities → verify your sending domain (add the DKIM records it gives you), or a single email address to start.
2. SES → SMTP settings → **Create SMTP credentials** → these are `SMTP_USER` / `SMTP_PASS`.
3. New SES accounts are in **sandbox** (can only send to verified addresses). Request production access under Account dashboard before mailing real employees.

## 5. Release flow

```bash
docker build -t kenpay . \
  && docker tag kenpay:latest ACCOUNT_ID.dkr.ecr.eu-west-1.amazonaws.com/kenpay:latest \
  && docker push ACCOUNT_ID.dkr.ecr.eu-west-1.amazonaws.com/kenpay:latest
# App Runner auto-deploys on push; run `prisma migrate deploy` first if the schema changed
```

## Hardening checklist
- `AUTH_SECRET` from Secrets Manager, rotated periodically
- RDS: automated backups on (7–35 days), deletion protection on
- Enable App Runner request logging → CloudWatch; set an alarm on 5xx rate
- Restrict SES `MAIL_FROM` domain with SPF/DKIM/DMARC records
- Consider AWS WAF in front (App Runner supports WAF association) for rate limiting the login endpoint

## Alternative: ECS Fargate
Same image works on ECS Fargate behind an ALB if you need finer networking control, blue/green deploys (CodeDeploy), or private-only ingress. App Runner is simpler; switch only when you outgrow it.

## Local production rehearsal

```bash
docker compose up --build
# app on http://localhost:3000, Postgres included, tables created on first boot
```
