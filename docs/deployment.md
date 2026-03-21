# Meeting Bingo — Deployment Guide

Complete step-by-step instructions for deploying Meeting Bingo on a fresh Ubuntu 24.04 LTS server.

---

## 1. Prerequisites

Before starting, ensure you have:

- A fresh **Ubuntu 24.04 LTS** server (Linode, DigitalOcean, AWS EC2, etc.)
- **Root SSH access** to the server
- A **domain name** with DNS A record pointing to the server's IP address
- Ports **22**, **80**, and **443** reachable from the internet

Verify DNS is propagated before proceeding:

```bash
dig +short your-domain.com
# Should return your server's IP address
```

---

## 2. Connect to Your Server

```bash
ssh root@your-server-ip
```

---

## 3. Install Git (if not present)

```bash
apt-get update && apt-get install -y git
```

---

## 4. Clone the Repository

```bash
git clone https://github.com/crosservice/meeting_bingo.git /opt/meeting-bingo
cd /opt/meeting-bingo
```

---

## 5. Run the Deployment Script

The deployment script is a single Python file that handles everything: system packages, Node.js, PostgreSQL, Nginx, TLS, firewall, hardening, and application setup.

### Minimal deployment (recommended)

```bash
sudo python3 infra/scripts/deploy.py \
  --domain bingo.yourdomain.com \
  --tls-email you@example.com \
  --db-password "$(openssl rand -base64 24)"
```

### Full options deployment

```bash
sudo python3 infra/scripts/deploy.py \
  --domain bingo.yourdomain.com \
  --tls-email you@example.com \
  --app-dir /opt/meeting-bingo \
  --api-port 3001 \
  --web-port 3000 \
  --db-host localhost \
  --db-port 5432 \
  --db-name meeting_bingo \
  --db-user meeting_bingo \
  --db-password "$(openssl rand -base64 24)" \
  --create-db \
  --install-backup-timer \
  --run-seed
```

### With an external database (skip local PostgreSQL setup)

```bash
sudo python3 infra/scripts/deploy.py \
  --domain bingo.yourdomain.com \
  --tls-email you@example.com \
  --no-create-db \
  --db-host your-db-host.com \
  --db-port 5432 \
  --db-name meeting_bingo \
  --db-user meeting_bingo \
  --db-password "your-db-password"
```

---

## 6. Review the Deployment Report

The script prints a step-by-step report at the end:

```
======================================================================
  DEPLOYMENT REPORT
======================================================================
  PASS  ✓  OS validation                   Ubuntu 24.04.1
  PASS  ✓  System packages                 System packages installed
  PASS  ✓  Node.js install                 Node.js v22.x.x installed
  PASS  ✓  PostgreSQL                      PostgreSQL installed and started
  PASS  ✓  Database setup                  Database 'meeting_bingo' created
  PASS  ✓  Nginx install                   Nginx installed
  PASS  ✓  Certbot install                 Certbot installed
  PASS  ✓  Service user                    User 'meetingbingo' created
  PASS  ✓  App directories                 Directories created
  PASS  ✓  Environment file                .env created with generated secrets
  PASS  ✓  App dependencies                Dependencies installed
  PASS  ✓  App build                       Frontend and backend built
  PASS  ✓  Database migrations             Migrations applied
  PASS  ✓  Systemd services                Services configured and started
  PASS  ✓  Nginx config                    Nginx configured for your-domain
  PASS  ✓  TLS certificate                 TLS certificate obtained
  PASS  ✓  Firewall (UFW)                  UFW configured (22, 80, 443)
  PASS  ✓  System hardening                fail2ban; unattended-upgrades
  PASS  ✓  Log rotation                    Log rotation configured
  PASS  ✓  Backup job                      Backup cron job installed
  PASS  ✓  Health checks                   API health check passed
----------------------------------------------------------------------
  Total: 21 steps | 21 PASS | 0 SKIP | 0 FAIL
  ✓ Deployment completed successfully.
======================================================================
```

If any step shows **FAIL**, follow the remediation note printed beneath it.

---

## 7. Verify the Deployment

### Check services are running

```bash
systemctl status meeting-bingo-api
systemctl status meeting-bingo-web
systemctl status nginx
systemctl status postgresql
```

### Check health endpoints

```bash
# Internal API health
curl -s http://localhost:3001/health | python3 -m json.tool

# Internal API readiness (includes database)
curl -s http://localhost:3001/health/ready | python3 -m json.tool

# External HTTPS (via Nginx)
curl -s https://your-domain.com/health | python3 -m json.tool
```

### Visit in browser

Open `https://your-domain.com` — you should see the Meeting Bingo homepage with Sign In and Create Account buttons.

---

## 8. Post-Deployment Steps

### Create your first admin account

1. Visit `https://your-domain.com/register`
2. Create an account with your desired nickname
3. You're now ready to create meetings, invite participants, and run bingo games

### Review the .env file

The deployment script generates random secrets. Review and optionally customize:

```bash
sudo cat /opt/meeting-bingo/.env
```

Key values:
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — auto-generated, rotate periodically
- `DB_PASSWORD` — set during deployment
- `WEB_URL` — must match your domain with `https://`

### Verify backups

```bash
# Run a manual backup
sudo -u meetingbingo /opt/meeting-bingo/infra/scripts/backup.sh

# Check backup was created
ls -la /opt/meeting-bingo/data/backups/

# The cron job runs daily at 2am automatically
cat /etc/cron.d/meeting-bingo-backup
```

### Check security

```bash
# Firewall status
sudo ufw status verbose

# fail2ban status
sudo fail2ban-client status sshd

# TLS certificate
sudo certbot certificates

# App is running as non-root
ps aux | grep meeting-bingo
```

---

## Script Options Reference

| Flag | Default | Description |
|------|---------|-------------|
| `--domain` | *(required)* | Domain name for the application |
| `--tls-email` | *(required)* | Email address for Let's Encrypt certificate |
| `--app-dir` | `/opt/meeting-bingo` | Application install directory |
| `--api-port` | `3001` | NestJS API listen port |
| `--web-port` | `3000` | Next.js listen port |
| `--db-host` | `localhost` | PostgreSQL host |
| `--db-port` | `5432` | PostgreSQL port |
| `--db-name` | `meeting_bingo` | Database name |
| `--db-user` | `meeting_bingo` | Database user |
| `--db-password` | `changeme` | Database password (**always override this**) |
| `--create-db` | `true` | Install PostgreSQL and create database locally |
| `--no-create-db` | — | Skip PostgreSQL install (use external DB) |
| `--run-seed` | `false` | Load test seed data after migration |
| `--no-seed` | — | Skip seed data (default) |
| `--install-backup-timer` | `true` | Install daily pg_dump cron job |
| `--force-env` | `false` | Overwrite existing `.env` file |

---

## Redeployment / Updates

The script is idempotent — safe to rerun. For application updates:

```bash
cd /opt/meeting-bingo

# Pull latest code
git pull origin main

# Reinstall dependencies (in case of changes)
pnpm install --frozen-lockfile

# Rebuild
pnpm run build

# Run any new migrations
pnpm run migrate

# Restart services
sudo systemctl restart meeting-bingo-api
sudo systemctl restart meeting-bingo-web
```

Or rerun the full deployment script (it skips already-completed steps):

```bash
sudo python3 infra/scripts/deploy.py \
  --domain bingo.yourdomain.com \
  --tls-email you@example.com \
  --db-password "your-existing-password"
```

---

## What the Deployment Script Provisions

1. **OS validation** — confirms Ubuntu 24.04 LTS
2. **System packages** — build-essential, curl, git, etc.
3. **Node.js LTS** — via NodeSource, with pnpm enabled via corepack
4. **PostgreSQL** — installed, started, database and user created
5. **Nginx** — reverse proxy with HTTPS, WebSocket support, security headers
6. **Certbot** — Let's Encrypt TLS certificates with auto-renewal
7. **Service user** — `meetingbingo` non-root user for app runtime
8. **Environment** — `.env` with generated JWT secrets, DB credentials, 600 permissions
9. **Application** — `pnpm install`, `pnpm build` (both frontend and backend)
10. **Migrations** — all database tables created
11. **Systemd** — two services with hardening (NoNewPrivileges, ProtectSystem, PrivateTmp)
12. **Firewall** — UFW allowing only SSH (22), HTTP (80), HTTPS (443)
13. **Hardening** — fail2ban for SSH, unattended security updates
14. **Logging** — Nginx log rotation (14 days, compressed)
15. **Backups** — daily pg_dump cron at 2am, 30-day retention
16. **Health check** — verifies API responds after deployment

---

## Architecture on Server

```
Internet
  │
  ▼ (443/HTTPS)
Nginx (reverse proxy + TLS termination)
  ├── /              → Next.js (:3000) — frontend
  ├── /api/*         → NestJS  (:3001) — REST API
  ├── /auth/*        → NestJS  (:3001) — auth endpoints
  ├── /socket.io/*   → NestJS  (:3001) — WebSocket (upgraded)
  └── /health        → NestJS  (:3001) — health check
  │
  ▼
PostgreSQL (:5432, localhost only)
  └── meeting_bingo database
```

Both services run as systemd units under the `meetingbingo` user. Export files are stored at `/opt/meeting-bingo/data/exports/` (outside web root, served only via authenticated API endpoint).
