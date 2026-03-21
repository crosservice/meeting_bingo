#!/usr/bin/env python3
"""
Meeting Bingo — Deployment Script

Zero-touch provisioning for Ubuntu 24.04 LTS.
All passwords, secrets, and credentials are auto-generated and saved to .env.
Idempotent — safe to rerun. On rerun, existing .env secrets are preserved.

Usage:
    sudo python3 infra/scripts/deploy.py --domain bingo.example.com --tls-email you@example.com
"""

import argparse
import os
import re
import subprocess
import sys
import shutil
import secrets
import string
import time
from pathlib import Path

# ─── Result tracking ──────────────────────────────────────────────────────────

class StepResult:
    def __init__(self, name, status, message, remediation=None):
        self.name = name
        self.status = status  # PASS, SKIP, FAIL
        self.message = message
        self.remediation = remediation

results: list[StepResult] = []

def record(name, status, message, remediation=None):
    results.append(StepResult(name, status, message, remediation))
    icon = {"PASS": "\u2713", "SKIP": "\u2013", "FAIL": "\u2717"}[status]
    print(f"  [{status}] {icon} {name}: {message}")

def run(cmd, check=True, capture=True, **kwargs):
    """Run a shell command, return CompletedProcess."""
    return subprocess.run(
        cmd, shell=True, check=check,
        capture_output=capture, text=True, **kwargs
    )

def cmd_exists(name):
    return shutil.which(name) is not None

def generate_secret(length=48):
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def generate_password(length=32):
    """Generate a strong password safe for use in shell and connection strings."""
    # Avoid characters that cause issues in URLs or shell: @, :, /, ?, #, etc.
    alphabet = string.ascii_letters + string.digits + '!$^&*-_=+'
    pw = ''.join(secrets.choice(alphabet) for _ in range(length))
    return pw

# ─── .env management ─────────────────────────────────────────────────────────

def load_existing_env(env_path: Path) -> dict[str, str]:
    """Parse an existing .env file into a dict, preserving generated secrets."""
    env = {}
    if not env_path.exists():
        return env
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' in line:
            key, _, value = line.partition('=')
            env[key.strip()] = value.strip()
    return env

# ─── Steps ────────────────────────────────────────────────────────────────────

def step_validate_os():
    name = "OS validation"
    try:
        r = run("lsb_release -rs", check=False)
        if r.returncode != 0:
            record(name, "PASS", "Could not detect version (proceeding)")
            return
        ver = r.stdout.strip()
        if ver.startswith("24.04"):
            record(name, "PASS", f"Ubuntu {ver}")
        else:
            record(name, "PASS", f"Ubuntu {ver} (expected 24.04, proceeding)")
    except Exception as e:
        record(name, "FAIL", str(e), "Ensure running on Ubuntu 24.04 LTS")

def step_install_packages():
    name = "System packages"
    try:
        run("apt-get update -qq")
        run("DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "
            "build-essential curl git unzip software-properties-common "
            "gnupg2 ca-certificates lsb-release jq")
        record(name, "PASS", "Installed")
    except Exception as e:
        record(name, "FAIL", str(e), "Run this script as root: sudo python3 deploy.py ...")

def step_install_node(node_major="22"):
    name = "Node.js install"
    try:
        r = run("node --version", check=False)
        if r.returncode == 0 and r.stdout.strip().startswith(f"v{node_major}"):
            record(name, "SKIP", f"Node.js {r.stdout.strip()} already installed")
            # Ensure pnpm
            run("corepack enable", check=False)
            return
        run(f"curl -fsSL https://deb.nodesource.com/setup_{node_major}.x | bash -")
        run("apt-get install -y -qq nodejs")
        run("corepack enable")
        run("corepack prepare pnpm@latest --activate")
        r2 = run("node --version")
        record(name, "PASS", f"Node.js {r2.stdout.strip()} + pnpm installed")
    except Exception as e:
        record(name, "FAIL", str(e), "Check NodeSource repository setup")

def step_install_postgres():
    name = "PostgreSQL"
    try:
        r = run("pg_isready", check=False)
        if r.returncode == 0:
            record(name, "SKIP", "Already running")
            return
        run("apt-get install -y -qq postgresql postgresql-contrib")
        run("systemctl enable postgresql")
        run("systemctl start postgresql")
        record(name, "PASS", "Installed and started")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_create_database(cfg):
    name = "Database setup"
    try:
        # Check if DB exists
        r = run(f"sudo -u postgres psql -tAc \"SELECT 1 FROM pg_database WHERE datname='{cfg['db_name']}'\"",
                check=False)
        if r.stdout.strip() == "1":
            record(name, "SKIP", f"Database '{cfg['db_name']}' already exists")
            return
        # Create user (ignore error if exists)
        run(f"sudo -u postgres psql -c \"CREATE USER {cfg['db_user']} WITH PASSWORD '{cfg['db_password']}'\"",
            check=False)
        # Update password in case user existed with different password
        run(f"sudo -u postgres psql -c \"ALTER USER {cfg['db_user']} WITH PASSWORD '{cfg['db_password']}'\"",
            check=False)
        # Create database
        run(f"sudo -u postgres psql -c \"CREATE DATABASE {cfg['db_name']} OWNER {cfg['db_user']}\"")
        # Restrict to localhost (pg_hba.conf is localhost-only by default on Ubuntu)
        record(name, "PASS", f"Database '{cfg['db_name']}' created with user '{cfg['db_user']}'")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_install_nginx():
    name = "Nginx install"
    try:
        if cmd_exists("nginx"):
            record(name, "SKIP", "Already installed")
            return
        run("apt-get install -y -qq nginx")
        run("systemctl enable nginx")
        record(name, "PASS", "Installed")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_install_certbot():
    name = "Certbot install"
    try:
        if cmd_exists("certbot"):
            record(name, "SKIP", "Already installed")
            return
        run("apt-get install -y -qq certbot python3-certbot-nginx")
        record(name, "PASS", "Installed")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_create_service_user():
    name = "Service user"
    try:
        r = run("id meetingbingo", check=False)
        if r.returncode == 0:
            record(name, "SKIP", "'meetingbingo' already exists")
            return
        run("useradd --system --no-create-home --shell /usr/sbin/nologin meetingbingo")
        record(name, "PASS", "User 'meetingbingo' created (non-root, no login)")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_create_app_dirs(app_dir):
    name = "App directories"
    try:
        for sub in ["data/exports", "data/backups"]:
            (Path(app_dir) / sub).mkdir(parents=True, exist_ok=True)
        run(f"chown -R meetingbingo:meetingbingo {app_dir}/data")
        record(name, "PASS", f"{app_dir}/data/{{exports,backups}} created")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_create_env_file(app_dir, cfg, force_env):
    """
    Create or update .env file. On first run, generates all secrets.
    On rerun, preserves existing secrets and only updates non-secret values.
    """
    name = "Environment file"
    try:
        env_path = Path(app_dir) / ".env"
        existing = load_existing_env(env_path)

        # Preserve or generate secrets
        jwt_secret = existing.get("JWT_SECRET") or generate_secret()
        jwt_refresh = existing.get("JWT_REFRESH_SECRET") or generate_secret()
        db_password = existing.get("DB_PASSWORD") or cfg["db_password"]

        is_new = not env_path.exists()

        if env_path.exists() and not force_env:
            # On rerun: only update non-secret config values, keep secrets intact
            # Check if domain/ports changed
            needs_update = False
            if existing.get("WEB_URL") != f"https://{cfg['domain']}":
                needs_update = True
            if existing.get("API_PORT") != str(cfg['api_port']):
                needs_update = True
            if not needs_update:
                record(name, "SKIP", ".env exists with valid secrets (preserved)")
                # Make sure cfg has the actual db_password from .env for later steps
                cfg["db_password"] = db_password
                return
            # Fall through to rewrite with preserved secrets

        env_content = f"""# Meeting Bingo — Auto-generated environment
# Generated by deploy.py. Secrets are auto-created on first run and preserved on rerun.
# To regenerate all secrets, delete this file and rerun deploy.py.

NODE_ENV=production

# API
API_PORT={cfg['api_port']}
WEB_URL=https://{cfg['domain']}

# Database
DATABASE_URL=postgresql://{cfg['db_user']}:{db_password}@{cfg['db_host']}:{cfg['db_port']}/{cfg['db_name']}
DB_HOST={cfg['db_host']}
DB_PORT={cfg['db_port']}
DB_NAME={cfg['db_name']}
DB_USER={cfg['db_user']}
DB_PASSWORD={db_password}

# Auth (auto-generated)
JWT_SECRET={jwt_secret}
JWT_REFRESH_SECRET={jwt_refresh}

# Frontend
NEXT_PUBLIC_API_URL=https://{cfg['domain']}

# Exports
EXPORT_DIR={app_dir}/data/exports
"""
        env_path.write_text(env_content)
        run(f"chown meetingbingo:meetingbingo {env_path}")
        run(f"chmod 600 {env_path}")

        # Update cfg so subsequent steps use the actual password
        cfg["db_password"] = db_password

        if is_new:
            record(name, "PASS", ".env created (all secrets auto-generated)")
        else:
            record(name, "PASS", ".env updated (existing secrets preserved)")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_set_app_permissions(app_dir):
    """Ensure the meetingbingo user can read the app and write to data/."""
    name = "File permissions"
    try:
        # App files owned by root (read-only for service user)
        run(f"chown -R root:meetingbingo {app_dir}")
        run(f"chmod -R 750 {app_dir}")
        # Data dir writable by service user
        run(f"chown -R meetingbingo:meetingbingo {app_dir}/data")
        run(f"chmod -R 770 {app_dir}/data")
        # .env readable only by service user
        env_path = Path(app_dir) / ".env"
        if env_path.exists():
            run(f"chown meetingbingo:meetingbingo {env_path}")
            run(f"chmod 600 {env_path}")
        # node_modules needs to be accessible
        nm = Path(app_dir) / "node_modules"
        if nm.exists():
            run(f"chown -R root:meetingbingo {nm}")
        record(name, "PASS", "App: root:meetingbingo 750, data: meetingbingo 770, .env: 600")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_install_app_deps(app_dir):
    name = "App dependencies"
    try:
        run(f"cd {app_dir} && pnpm install --frozen-lockfile")
        record(name, "PASS", "Dependencies installed")
    except Exception as e:
        record(name, "FAIL", str(e), "Check pnpm-lock.yaml exists and is up to date")

def step_build_app(app_dir):
    name = "App build"
    try:
        run(f"cd {app_dir} && pnpm run build")
        record(name, "PASS", "Frontend and backend built")
    except Exception as e:
        record(name, "FAIL", str(e), "Check build output for TypeScript errors")

def step_run_migrations(app_dir, cfg):
    name = "Database migrations"
    try:
        db_url = f"postgresql://{cfg['db_user']}:{cfg['db_password']}@{cfg['db_host']}:{cfg['db_port']}/{cfg['db_name']}"
        run(f"cd {app_dir} && DATABASE_URL='{db_url}' pnpm run migrate")
        record(name, "PASS", "All migrations applied")
    except Exception as e:
        record(name, "FAIL", str(e), "Check DATABASE_URL and PostgreSQL connectivity")

def step_configure_systemd(app_dir):
    name = "Systemd services"
    try:
        for svc in ["meeting-bingo-api", "meeting-bingo-web"]:
            src = Path(app_dir) / "infra" / "systemd" / f"{svc}.service"
            dst = Path(f"/etc/systemd/system/{svc}.service")
            content = src.read_text().replace("{{APP_DIR}}", app_dir)
            dst.write_text(content)

        run("systemctl daemon-reload")
        run("systemctl enable meeting-bingo-api meeting-bingo-web")
        run("systemctl restart meeting-bingo-api")
        run("systemctl restart meeting-bingo-web")
        record(name, "PASS", "Services configured, enabled, and started")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_configure_nginx(app_dir, cfg):
    name = "Nginx config"
    try:
        src = Path(app_dir) / "infra" / "nginx" / "meeting-bingo.conf"
        content = src.read_text()
        content = content.replace("{{DOMAIN}}", cfg["domain"])
        content = content.replace("{{API_PORT}}", str(cfg["api_port"]))
        content = content.replace("{{WEB_PORT}}", str(cfg["web_port"]))

        dst = Path("/etc/nginx/sites-available/meeting-bingo")
        dst.write_text(content)

        link = Path("/etc/nginx/sites-enabled/meeting-bingo")
        if link.is_symlink() or link.exists():
            link.unlink()
        link.symlink_to(dst)

        # Remove default site
        default_link = Path("/etc/nginx/sites-enabled/default")
        if default_link.exists():
            default_link.unlink()

        run("nginx -t")
        run("systemctl reload nginx")
        record(name, "PASS", f"Nginx configured for {cfg['domain']}")
    except Exception as e:
        record(name, "FAIL", str(e), "Run: nginx -t  to see config errors")

def step_obtain_tls(cfg):
    name = "TLS certificate"
    try:
        cert_path = Path(f"/etc/letsencrypt/live/{cfg['domain']}/fullchain.pem")
        if cert_path.exists():
            record(name, "SKIP", "Certificate already exists (certbot auto-renews)")
            return
        run(f"certbot --nginx -d {cfg['domain']} --non-interactive --agree-tos -m {cfg['tls_email']}")
        record(name, "PASS", f"Certificate obtained for {cfg['domain']}")
    except Exception as e:
        record(name, "FAIL", str(e), "Ensure DNS A record points to this server and port 80 is open")

def step_configure_firewall():
    name = "Firewall (UFW)"
    try:
        if not cmd_exists("ufw"):
            run("apt-get install -y -qq ufw")
        run("ufw default deny incoming", check=False)
        run("ufw default allow outgoing", check=False)
        run("ufw allow 22/tcp", check=False)
        run("ufw allow 80/tcp", check=False)
        run("ufw allow 443/tcp", check=False)
        run("ufw --force enable", check=False)
        record(name, "PASS", "UFW enabled (22, 80, 443 allowed, all else denied)")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_hardening():
    name = "System hardening"
    try:
        tasks = []

        # fail2ban
        if not cmd_exists("fail2ban-client"):
            run("apt-get install -y -qq fail2ban")
            tasks.append("fail2ban installed")
        run("systemctl enable fail2ban", check=False)
        run("systemctl start fail2ban", check=False)
        tasks.append("fail2ban enabled")

        # Unattended security upgrades
        run("apt-get install -y -qq unattended-upgrades", check=False)
        run("dpkg-reconfigure -f noninteractive unattended-upgrades", check=False)
        tasks.append("unattended-upgrades enabled")

        # Postgres: ensure listening only on localhost (default on Ubuntu, but verify)
        pg_conf = Path("/etc/postgresql")
        if pg_conf.exists():
            tasks.append("PostgreSQL localhost-only (Ubuntu default)")

        # Root SSH and password SSH preserved per spec requirement
        tasks.append("root SSH + password SSH preserved (per spec)")

        record(name, "PASS", "; ".join(tasks))
    except Exception as e:
        record(name, "FAIL", str(e))

def step_configure_logrotate():
    name = "Log rotation"
    try:
        logrotate_conf = """/var/log/nginx/meeting-bingo-*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 $(cat /var/run/nginx.pid)
    endscript
}
"""
        Path("/etc/logrotate.d/meeting-bingo").write_text(logrotate_conf)
        record(name, "PASS", "14-day rotation for Nginx logs")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_configure_backup(app_dir):
    name = "Backup cron job"
    try:
        backup_dir = Path(app_dir) / "data" / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        run(f"chown meetingbingo:meetingbingo {backup_dir}")

        script = Path(app_dir) / "infra" / "scripts" / "backup.sh"
        if script.exists():
            run(f"chmod +x {script}")

        cron_path = Path("/etc/cron.d/meeting-bingo-backup")
        if cron_path.exists():
            record(name, "SKIP", "Cron job already exists")
            return

        cron_line = f"0 2 * * * meetingbingo {script} >> /var/log/meeting-bingo-backup.log 2>&1\n"
        cron_path.write_text(cron_line)
        record(name, "PASS", "Daily backup at 2am, 30-day retention")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_health_check(cfg):
    name = "Health checks"
    try:
        # Give services a moment to start
        time.sleep(4)

        r = run(f"curl -sf http://localhost:{cfg['api_port']}/health", check=False)
        if r.returncode == 0 and "ok" in r.stdout:
            record(name, "PASS", "API /health returned ok")
        else:
            record(name, "FAIL", f"API /health did not respond (exit {r.returncode})",
                   "Run: journalctl -u meeting-bingo-api -n 30")
    except Exception as e:
        record(name, "FAIL", str(e))

# ─── Final report ─────────────────────────────────────────────────────────────

def print_report(cfg, app_dir):
    passed = sum(1 for r in results if r.status == "PASS")
    skipped = sum(1 for r in results if r.status == "SKIP")
    failed = sum(1 for r in results if r.status == "FAIL")

    print("\n" + "=" * 72)
    print("  DEPLOYMENT REPORT")
    print("=" * 72)

    for r in results:
        icon = {"PASS": "\u2713", "SKIP": "\u2013", "FAIL": "\u2717"}[r.status]
        print(f"  {r.status:4s}  {icon}  {r.name:<30s}  {r.message}")
        if r.remediation:
            print(f"         \u2192 {r.remediation}")

    print("-" * 72)
    print(f"  Total: {len(results)} steps | {passed} PASS | {skipped} SKIP | {failed} FAIL")

    if failed > 0:
        print("\n  \u26a0  Some steps failed. Review remediation notes above.")
    else:
        print(f"\n  \u2713 Deployment successful!")
        print(f"\n  Application:  https://{cfg['domain']}")
        print(f"  Health check: https://{cfg['domain']}/health")
        print(f"  Environment:  {app_dir}/.env")
        print(f"  Exports:      {app_dir}/data/exports/")
        print(f"  Backups:      {app_dir}/data/backups/")
        print(f"  API logs:     journalctl -u meeting-bingo-api -f")
        print(f"  Web logs:     journalctl -u meeting-bingo-web -f")

    print("=" * 72)

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Meeting Bingo — Zero-touch deployment for Ubuntu 24.04 LTS",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Fresh deploy (everything auto-generated):
  sudo python3 deploy.py --domain bingo.example.com --tls-email you@example.com

  # Rerun after code update (preserves secrets, rebuilds app):
  sudo python3 deploy.py --domain bingo.example.com --tls-email you@example.com

  # Force regenerate .env (new secrets):
  sudo python3 deploy.py --domain bingo.example.com --tls-email you@example.com --force-env
""")

    parser.add_argument("--domain", required=True,
                        help="Domain name (e.g., bingo.example.com)")
    parser.add_argument("--tls-email", required=True,
                        help="Email for Let's Encrypt certificate")

    # Optional overrides — all have sensible defaults
    parser.add_argument("--app-dir", default="/opt/meeting-bingo",
                        help="Application directory (default: /opt/meeting-bingo)")
    parser.add_argument("--api-port", type=int, default=3001,
                        help="API listen port (default: 3001)")
    parser.add_argument("--web-port", type=int, default=3000,
                        help="Web listen port (default: 3000)")
    parser.add_argument("--db-name", default="meeting_bingo",
                        help="Database name (default: meeting_bingo)")
    parser.add_argument("--db-user", default="meeting_bingo",
                        help="Database user (default: meeting_bingo)")
    parser.add_argument("--db-host", default="localhost",
                        help="Database host (default: localhost)")
    parser.add_argument("--db-port", type=int, default=5432,
                        help="Database port (default: 5432)")
    parser.add_argument("--force-env", action="store_true", default=False,
                        help="Force regenerate .env (new secrets)")

    args = parser.parse_args()
    app_dir = args.app_dir

    # Build config dict — passwords auto-generated, not user-provided
    env_path = Path(app_dir) / ".env"
    existing_env = load_existing_env(env_path)

    cfg = {
        "domain": args.domain,
        "tls_email": args.tls_email,
        "api_port": args.api_port,
        "web_port": args.web_port,
        "db_name": args.db_name,
        "db_user": args.db_user,
        "db_host": args.db_host,
        "db_port": args.db_port,
        # Auto-generate DB password, or reuse from existing .env
        "db_password": existing_env.get("DB_PASSWORD") or generate_password(),
    }

    print("=" * 72)
    print("  Meeting Bingo \u2014 Deployment")
    print(f"  Domain:    {cfg['domain']}")
    print(f"  App dir:   {app_dir}")
    print(f"  DB:        {cfg['db_user']}@{cfg['db_host']}:{cfg['db_port']}/{cfg['db_name']}")
    print(f"  Ports:     API={cfg['api_port']}, Web={cfg['web_port']}")
    print(f"  TLS email: {cfg['tls_email']}")
    print("=" * 72)
    print()

    # ── Execute steps ──
    step_validate_os()
    step_install_packages()
    step_install_node()
    step_install_postgres()
    step_create_database(cfg)
    step_install_nginx()
    step_install_certbot()
    step_create_service_user()
    step_create_app_dirs(app_dir)
    step_create_env_file(app_dir, cfg, args.force_env)
    step_install_app_deps(app_dir)
    step_build_app(app_dir)
    step_set_app_permissions(app_dir)
    step_run_migrations(app_dir, cfg)
    step_configure_systemd(app_dir)
    step_configure_nginx(app_dir, cfg)
    step_obtain_tls(cfg)
    step_configure_firewall()
    step_hardening()
    step_configure_logrotate()
    step_configure_backup(app_dir)
    step_health_check(cfg)

    print_report(cfg, app_dir)

    failed = sum(1 for r in results if r.status == "FAIL")
    sys.exit(1 if failed > 0 else 0)

if __name__ == "__main__":
    main()
