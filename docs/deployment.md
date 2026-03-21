# Meeting Bingo — Deployment Guide

Deploy Meeting Bingo on a fresh Ubuntu 24.04 LTS server with a single command. The deployment script handles everything: system packages, Node.js, PostgreSQL, Nginx, TLS, users, permissions, secrets, firewall, hardening, backups, and health checks. All passwords and secrets are auto-generated.

---

## Prerequisites

- A fresh **Ubuntu 24.04 LTS** server (Linode, DigitalOcean, AWS, etc.)
- **Root SSH access**
- A **domain name** with a DNS A record pointing to the server's IP
- Ports **80** and **443** reachable from the internet

---

## Deploy

SSH into your server and run these commands:

```bash
ssh root@your-server-ip
```

```bash
apt-get update && apt-get install -y git
```

```bash
git clone https://github.com/crosservice/meeting_bingo.git /opt/meeting-bingo
```

```bash
cd /opt/meeting-bingo && sudo python3 infra/scripts/deploy.py \
  --domain bingo.yourdomain.com \
  --tls-email you@example.com
```

That's it. Everything else is automatic.

---

## What Happens

The script runs 22 idempotent steps:

| # | Step | What it does |
|---|------|-------------|
| 1 | OS validation | Confirms Ubuntu 24.04 |
| 2 | System packages | Installs build-essential, curl, git, jq, etc. |
| 3 | Node.js | Installs Node.js 22 LTS + pnpm via corepack |
| 4 | PostgreSQL | Installs and starts PostgreSQL |
| 5 | Database setup | Creates DB user (auto-generated password) and database |
| 6 | Nginx | Installs Nginx reverse proxy |
| 7 | Certbot | Installs Let's Encrypt tooling |
| 8 | Service user | Creates `meetingbingo` non-root system user |
| 9 | App directories | Creates `data/exports/` and `data/backups/` |
| 10 | Environment file | Generates `.env` with all secrets (DB password, JWT secrets) |
| 11 | Dependencies | Runs `pnpm install --frozen-lockfile` |
| 12 | Build | Builds Next.js frontend + NestJS backend |
| 13 | Permissions | Sets app=root:meetingbingo 750, data=meetingbingo 770, .env=600 |
| 14 | Migrations | Creates all 15 database tables |
| 15 | Systemd | Configures and starts API + web services with hardening |
| 16 | Nginx config | HTTPS reverse proxy with WSS, security headers |
| 17 | TLS | Obtains Let's Encrypt certificate (auto-renews) |
| 18 | Firewall | UFW: allow 22, 80, 443 only |
| 19 | Hardening | fail2ban, unattended security upgrades |
| 20 | Log rotation | 14-day Nginx log rotation |
| 21 | Backups | Daily pg_dump cron at 2am, 30-day retention |
| 22 | Health check | Verifies API responds |

All passwords and secrets are auto-generated on the first run. On subsequent runs, existing secrets in `.env` are preserved — only configuration values (domain, ports) are updated if changed.

---

## After Deployment

### Check the report

The script prints a final report:

```
======================================================================
  DEPLOYMENT REPORT
======================================================================
  PASS  ✓  OS validation                   Ubuntu 24.04.1
  PASS  ✓  System packages                 Installed
  PASS  ✓  Node.js install                 Node.js v22.x.x + pnpm installed
  PASS  ✓  PostgreSQL                      Installed and started
  PASS  ✓  Database setup                  Database 'meeting_bingo' created
  ...
  PASS  ✓  Health checks                   API /health returned ok
----------------------------------------------------------------------
  Total: 22 steps | 22 PASS | 0 SKIP | 0 FAIL

  ✓ Deployment successful!

  Application:  https://bingo.yourdomain.com
  Health check: https://bingo.yourdomain.com/health
  Environment:  /opt/meeting-bingo/.env
  ...
======================================================================
```

### Visit the app

Open `https://bingo.yourdomain.com` in your browser. Register an account and start creating meetings.

### View your auto-generated secrets

```bash
sudo cat /opt/meeting-bingo/.env
```

All values (DB_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET) were auto-generated. You never need to set them manually.

### Check service status

```bash
systemctl status meeting-bingo-api
systemctl status meeting-bingo-web
systemctl status nginx
systemctl status postgresql
```

### View logs

```bash
journalctl -u meeting-bingo-api -f
journalctl -u meeting-bingo-web -f
```

---

## Updating

Pull new code and rerun the script. It skips completed steps and preserves your secrets:

```bash
cd /opt/meeting-bingo
git pull origin main
sudo python3 infra/scripts/deploy.py \
  --domain bingo.yourdomain.com \
  --tls-email you@example.com
```

Or do it manually:

```bash
cd /opt/meeting-bingo
git pull origin main
pnpm install --frozen-lockfile
pnpm run build
pnpm run migrate
sudo systemctl restart meeting-bingo-api
sudo systemctl restart meeting-bingo-web
```

---

## Optional Flags

All flags beyond `--domain` and `--tls-email` are optional with sensible defaults:

| Flag | Default | Description |
|------|---------|-------------|
| `--domain` | *(required)* | Your domain name |
| `--tls-email` | *(required)* | Email for Let's Encrypt |
| `--app-dir` | `/opt/meeting-bingo` | Where the app lives |
| `--api-port` | `3001` | NestJS API port |
| `--web-port` | `3000` | Next.js port |
| `--db-name` | `meeting_bingo` | Database name |
| `--db-user` | `meeting_bingo` | Database user |
| `--db-host` | `localhost` | PostgreSQL host |
| `--db-port` | `5432` | PostgreSQL port |
| `--force-env` | `false` | Regenerate .env with new secrets |

Passwords and secrets are never CLI arguments. They are auto-generated and stored in `.env`.

---

## Security Summary

| Concern | How it's handled |
|---------|-----------------|
| Secrets | Auto-generated, stored in `.env` (chmod 600, owned by meetingbingo) |
| App runtime | Non-root `meetingbingo` user, systemd hardening (NoNewPrivileges, ProtectSystem=strict) |
| Database | Password auto-generated, localhost-only, least-privilege user |
| TLS | Let's Encrypt with auto-renewal, TLS 1.2+, strong ciphers |
| Firewall | UFW: only 22/80/443, deny all else |
| SSH | fail2ban protects SSH (root + password SSH preserved per spec) |
| Updates | Unattended security upgrades enabled |
| Headers | HSTS, CSP, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy |
| Exports | Stored outside web root, served only via authenticated API |
| Backups | Daily pg_dump at 2am, 30-day retention, `data/backups/` |

---

## Architecture

```
Internet
  │
  ▼ (443/HTTPS)
Nginx (TLS termination + reverse proxy)
  ├── /              → Next.js (:3000)
  ├── /auth/*        → NestJS  (:3001)
  ├── /socket.io/*   → NestJS  (:3001) [WebSocket]
  ├── /health        → NestJS  (:3001)
  └── /api/*         → NestJS  (:3001)
  │
  ▼
PostgreSQL (:5432, localhost only)
  └── meeting_bingo database
```

---

## Troubleshooting

See [runbook.md](runbook.md) for operational commands: service management, database operations, TLS renewal, secret rotation, and common error resolution.
