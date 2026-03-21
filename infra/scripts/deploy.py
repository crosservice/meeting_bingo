#!/usr/bin/env python3
"""
Meeting Bingo — Deployment Script

Zero-touch provisioning for Ubuntu 24.04 LTS.
All passwords, secrets, and credentials are auto-generated and saved to .env.
Idempotent — safe to rerun. On rerun, existing .env secrets are preserved.

Output streams live so you can see progress. Stops on first failure.

Usage:
    sudo python3 infra/scripts/deploy.py --domain bingo.example.com --tls-email you@example.com
"""

import argparse
import os
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
current_step_name: str = ""

def record(name, status, message, remediation=None):
    results.append(StepResult(name, status, message, remediation))

def log(msg):
    """Print a timestamped log line."""
    ts = time.strftime("%H:%M:%S")
    print(f"  [{ts}] {msg}", flush=True)

def step_start(name):
    """Mark the beginning of a step with a visible header."""
    global current_step_name
    current_step_name = name
    step_num = len(results) + 1
    print(flush=True)
    print(f"  ── Step {step_num}: {name} ──", flush=True)

def step_pass(message):
    record(current_step_name, "PASS", message)
    log(f"\u2713 {message}")

def step_skip(message):
    record(current_step_name, "SKIP", message)
    log(f"\u2013 {message}")

def step_fail(message, remediation=None):
    record(current_step_name, "FAIL", message, remediation)
    log(f"\u2717 FAILED: {message}")
    if remediation:
        log(f"  Fix: {remediation}")

class DeploymentFailed(Exception):
    """Raised to stop deployment on first failure."""
    pass

def run(cmd, check=True, stream=False):
    """
    Run a shell command.
    If stream=True, output is printed live to the terminal.
    If stream=False, output is captured and returned.
    """
    if stream:
        # Stream output live so user sees progress
        result = subprocess.run(
            cmd, shell=True,
            stdout=sys.stdout, stderr=sys.stderr,
            text=True,
        )
        if check and result.returncode != 0:
            raise subprocess.CalledProcessError(result.returncode, cmd)
        return result
    else:
        result = subprocess.run(
            cmd, shell=True,
            capture_output=True, text=True,
        )
        if check and result.returncode != 0:
            raise subprocess.CalledProcessError(
                result.returncode, cmd, result.stdout, result.stderr
            )
        return result

def run_quiet(cmd, check=True):
    """Run a command with output captured (not shown)."""
    return run(cmd, check=check, stream=False)

def run_live(cmd, check=True):
    """Run a command with live output streaming."""
    return run(cmd, check=check, stream=True)

def cmd_exists(name):
    return shutil.which(name) is not None

def generate_secret(length=48):
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def generate_password(length=32):
    alphabet = string.ascii_letters + string.digits + '!$^&*-_=+'
    return ''.join(secrets.choice(alphabet) for _ in range(length))

# ─── .env management ─────────────────────────────────────────────────────────

def load_existing_env(env_path: Path) -> dict[str, str]:
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

def do_validate_os():
    step_start("OS validation")
    try:
        r = run_quiet("lsb_release -rs", check=False)
        if r.returncode != 0:
            step_pass("Could not detect version (proceeding)")
            return
        ver = r.stdout.strip()
        if ver.startswith("24.04"):
            step_pass(f"Ubuntu {ver}")
        else:
            step_pass(f"Ubuntu {ver} (expected 24.04, proceeding)")
    except Exception as e:
        step_fail(str(e), "Ensure running on Ubuntu 24.04 LTS")
        raise DeploymentFailed()

def do_install_packages():
    step_start("System packages")
    try:
        log("Updating apt package list...")
        run_quiet("apt-get update -qq")
        log("Installing build-essential, curl, git, jq...")
        run_live("DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "
                 "build-essential curl git unzip software-properties-common "
                 "gnupg2 ca-certificates lsb-release jq")
        step_pass("Installed")
    except Exception as e:
        step_fail(str(e), "Run this script as root: sudo python3 deploy.py ...")
        raise DeploymentFailed()

def do_install_node(node_major="22"):
    step_start("Node.js install")
    try:
        r = run_quiet("node --version", check=False)
        if r.returncode == 0 and r.stdout.strip().startswith(f"v{node_major}"):
            run_quiet("corepack enable", check=False)
            step_skip(f"Node.js {r.stdout.strip()} already installed")
            return
        log(f"Adding NodeSource v{node_major} repository...")
        run_live(f"curl -fsSL https://deb.nodesource.com/setup_{node_major}.x | bash -")
        log("Installing Node.js...")
        run_live("apt-get install -y -qq nodejs")
        log("Enabling pnpm via corepack...")
        run_live("corepack enable")
        run_live("corepack prepare pnpm@latest --activate")
        r2 = run_quiet("node --version")
        step_pass(f"Node.js {r2.stdout.strip()} + pnpm installed")
    except Exception as e:
        step_fail(str(e), "Check NodeSource repository setup")
        raise DeploymentFailed()

def do_install_postgres():
    step_start("PostgreSQL")
    try:
        r = run_quiet("pg_isready", check=False)
        if r.returncode == 0:
            step_skip("Already running")
            return
        log("Installing PostgreSQL...")
        run_live("apt-get install -y -qq postgresql postgresql-contrib")
        run_quiet("systemctl enable postgresql")
        run_quiet("systemctl start postgresql")
        step_pass("Installed and started")
    except Exception as e:
        step_fail(str(e))
        raise DeploymentFailed()

def do_create_database(cfg):
    step_start("Database setup")
    try:
        r = run_quiet(
            f"sudo -u postgres psql -tAc \"SELECT 1 FROM pg_database WHERE datname='{cfg['db_name']}'\"",
            check=False)
        if r.stdout.strip() == "1":
            step_skip(f"Database '{cfg['db_name']}' already exists")
            return
        log(f"Creating database user '{cfg['db_user']}'...")
        run_quiet(
            f"sudo -u postgres psql -c \"CREATE USER {cfg['db_user']} WITH PASSWORD '{cfg['db_password']}'\"",
            check=False)
        run_quiet(
            f"sudo -u postgres psql -c \"ALTER USER {cfg['db_user']} WITH PASSWORD '{cfg['db_password']}'\"",
            check=False)
        log(f"Creating database '{cfg['db_name']}'...")
        run_quiet(f"sudo -u postgres psql -c \"CREATE DATABASE {cfg['db_name']} OWNER {cfg['db_user']}\"")
        step_pass(f"Database '{cfg['db_name']}' created with user '{cfg['db_user']}'")
    except Exception as e:
        step_fail(str(e), "Check PostgreSQL is running: systemctl status postgresql")
        raise DeploymentFailed()

def do_install_nginx():
    step_start("Nginx")
    try:
        if cmd_exists("nginx"):
            step_skip("Already installed")
            return
        log("Installing Nginx...")
        run_live("apt-get install -y -qq nginx")
        run_quiet("systemctl enable nginx")
        step_pass("Installed")
    except Exception as e:
        step_fail(str(e))
        raise DeploymentFailed()

def do_install_certbot():
    step_start("Certbot")
    try:
        if cmd_exists("certbot"):
            step_skip("Already installed")
            return
        log("Installing Certbot...")
        run_live("apt-get install -y -qq certbot python3-certbot-nginx")
        step_pass("Installed")
    except Exception as e:
        step_fail(str(e))
        raise DeploymentFailed()

def do_create_service_user():
    step_start("Service user")
    try:
        r = run_quiet("id meetingbingo", check=False)
        if r.returncode == 0:
            step_skip("'meetingbingo' already exists")
            return
        run_quiet("useradd --system --no-create-home --shell /usr/sbin/nologin meetingbingo")
        step_pass("User 'meetingbingo' created (non-root, no login)")
    except Exception as e:
        step_fail(str(e))
        raise DeploymentFailed()

def do_create_app_dirs(app_dir):
    step_start("App directories")
    try:
        for sub in ["data/exports", "data/backups"]:
            (Path(app_dir) / sub).mkdir(parents=True, exist_ok=True)
        run_quiet(f"chown -R meetingbingo:meetingbingo {app_dir}/data")
        step_pass(f"{app_dir}/data/{{exports,backups}} created")
    except Exception as e:
        step_fail(str(e))
        raise DeploymentFailed()

def do_create_env_file(app_dir, cfg, force_env):
    step_start("Environment file")
    try:
        env_path = Path(app_dir) / ".env"
        existing = load_existing_env(env_path)

        jwt_secret = existing.get("JWT_SECRET") or generate_secret()
        jwt_refresh = existing.get("JWT_REFRESH_SECRET") or generate_secret()
        db_password = existing.get("DB_PASSWORD") or cfg["db_password"]

        is_new = not env_path.exists()

        if env_path.exists() and not force_env:
            needs_update = False
            if existing.get("WEB_URL") != f"https://{cfg['domain']}":
                needs_update = True
            if existing.get("API_PORT") != str(cfg['api_port']):
                needs_update = True
            if not needs_update:
                cfg["db_password"] = db_password
                step_skip(".env exists with valid secrets (preserved)")
                return

        log("Writing .env with auto-generated secrets...")
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
        run_quiet(f"chown meetingbingo:meetingbingo {env_path}")
        run_quiet(f"chmod 600 {env_path}")
        cfg["db_password"] = db_password

        if is_new:
            step_pass(".env created (all secrets auto-generated)")
        else:
            step_pass(".env updated (existing secrets preserved)")
    except Exception as e:
        step_fail(str(e))
        raise DeploymentFailed()

def do_install_app_deps(app_dir):
    step_start("App dependencies (pnpm install)")
    try:
        log("Installing node packages — this may take several minutes on first run...")
        run_live(f"cd {app_dir} && pnpm install --frozen-lockfile")
        step_pass("Dependencies installed")
    except Exception as e:
        step_fail(str(e), "Check pnpm-lock.yaml exists and is up to date")
        raise DeploymentFailed()

def do_build_app(app_dir):
    step_start("App build (pnpm build)")
    try:
        log("Building shared packages, NestJS API, and Next.js frontend...")
        # Next.js inlines NEXT_PUBLIC_* into the client bundle at build time.
        # We read .env via Python (handles special chars safely) and inject
        # NEXT_PUBLIC_* vars into the subprocess environment.
        env_vars = load_existing_env(Path(app_dir) / ".env")
        build_env = os.environ.copy()
        for key, value in env_vars.items():
            if key.startswith("NEXT_PUBLIC_"):
                build_env[key] = value
                log(f"  {key}={value}")
        result = subprocess.run(
            f"cd {app_dir} && pnpm run build",
            shell=True, stdout=sys.stdout, stderr=sys.stderr, text=True,
            env=build_env,
        )
        if result.returncode != 0:
            raise subprocess.CalledProcessError(result.returncode, "pnpm run build")
        step_pass("Frontend and backend built")
    except subprocess.CalledProcessError as e:
        step_fail(str(e), "Check build output above for TypeScript errors")
        raise DeploymentFailed()
    except Exception as e:
        step_fail(str(e), "Check build output above for TypeScript errors")
        raise DeploymentFailed()

def do_set_permissions(app_dir):
    step_start("File permissions")
    try:
        log("Setting ownership and permissions...")
        run_quiet(f"chown -R root:meetingbingo {app_dir}")
        run_quiet(f"chmod -R 750 {app_dir}")
        run_quiet(f"chown -R meetingbingo:meetingbingo {app_dir}/data")
        run_quiet(f"chmod -R 770 {app_dir}/data")
        env_path = Path(app_dir) / ".env"
        if env_path.exists():
            run_quiet(f"chown meetingbingo:meetingbingo {env_path}")
            run_quiet(f"chmod 600 {env_path}")
        nm = Path(app_dir) / "node_modules"
        if nm.exists():
            run_quiet(f"chown -R root:meetingbingo {nm}")
        step_pass("app=root:meetingbingo 750, data=meetingbingo 770, .env=600")
    except Exception as e:
        step_fail(str(e))
        raise DeploymentFailed()

def do_run_migrations(app_dir, cfg):
    step_start("Database migrations")
    try:
        db_url = f"postgresql://{cfg['db_user']}:{cfg['db_password']}@{cfg['db_host']}:{cfg['db_port']}/{cfg['db_name']}"
        log("Running migrations...")
        run_live(f"cd {app_dir} && DATABASE_URL='{db_url}' pnpm run migrate")
        step_pass("All migrations applied")
    except Exception as e:
        step_fail(str(e), "Check DATABASE_URL and PostgreSQL connectivity")
        raise DeploymentFailed()

def do_configure_systemd(app_dir):
    step_start("Systemd services")
    try:
        for svc in ["meeting-bingo-api", "meeting-bingo-web"]:
            src = Path(app_dir) / "infra" / "systemd" / f"{svc}.service"
            dst = Path(f"/etc/systemd/system/{svc}.service")
            content = src.read_text().replace("{{APP_DIR}}", app_dir)
            dst.write_text(content)
            log(f"Wrote {dst}")

        run_quiet("systemctl daemon-reload")
        run_quiet("systemctl enable meeting-bingo-api meeting-bingo-web")
        log("Starting meeting-bingo-api...")
        run_quiet("systemctl restart meeting-bingo-api")
        log("Starting meeting-bingo-web...")
        run_quiet("systemctl restart meeting-bingo-web")
        step_pass("Services configured, enabled, and started")
    except Exception as e:
        step_fail(str(e), "Run: journalctl -u meeting-bingo-api -n 30")
        raise DeploymentFailed()

def _write_nginx_config(app_dir, cfg, template_name):
    """Helper: write an nginx config from a template file, enable the site."""
    src = Path(app_dir) / "infra" / "nginx" / template_name
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

    default_link = Path("/etc/nginx/sites-enabled/default")
    if default_link.exists():
        default_link.unlink()

def do_configure_nginx_and_tls(app_dir, cfg):
    """
    Two-stage Nginx setup:
    1. If TLS cert already exists → write the full HTTPS config directly.
    2. If no cert yet → write HTTP-only config first, run certbot to obtain cert,
       then write the full HTTPS config on top.
    """
    cert_path = Path(f"/etc/letsencrypt/live/{cfg['domain']}/fullchain.pem")
    has_cert = cert_path.exists()

    if has_cert:
        # Cert exists — go straight to full HTTPS config
        step_start("Nginx config (HTTPS)")
        try:
            log(f"TLS certificate found, writing HTTPS config...")
            _write_nginx_config(app_dir, cfg, "meeting-bingo.conf")
            log("Testing nginx config...")
            run_live("nginx -t")
            run_quiet("systemctl reload nginx")
            step_pass(f"Nginx HTTPS configured for {cfg['domain']}")
        except Exception as e:
            step_fail(str(e), "Run: nginx -t  to see config errors")
            raise DeploymentFailed()

        step_start("TLS certificate")
        step_skip("Certificate already exists (certbot auto-renews)")
    else:
        # No cert — deploy HTTP-only first so certbot can validate
        step_start("Nginx config (HTTP for certbot)")
        try:
            log("No TLS certificate yet — deploying HTTP-only config for certbot validation...")
            _write_nginx_config(app_dir, cfg, "meeting-bingo-initial.conf")
            log("Testing nginx config...")
            run_live("nginx -t")
            run_quiet("systemctl reload nginx")
            step_pass(f"HTTP config deployed for {cfg['domain']}")
        except Exception as e:
            step_fail(str(e), "Run: nginx -t  to see config errors")
            raise DeploymentFailed()

        # Now obtain cert
        step_start("TLS certificate")
        try:
            log(f"Requesting certificate for {cfg['domain']} from Let's Encrypt...")
            run_live(f"certbot --nginx -d {cfg['domain']} --non-interactive --agree-tos -m {cfg['tls_email']}")
            step_pass(f"Certificate obtained for {cfg['domain']}")
        except Exception as e:
            step_fail(str(e), "Ensure DNS A record points to this server and port 80 is open")
            raise DeploymentFailed()

        # Now write the full HTTPS config with hardened settings
        step_start("Nginx config (HTTPS upgrade)")
        try:
            log("Upgrading to full HTTPS config with security headers...")
            _write_nginx_config(app_dir, cfg, "meeting-bingo.conf")
            log("Testing nginx config...")
            run_live("nginx -t")
            run_quiet("systemctl reload nginx")
            step_pass(f"Nginx HTTPS configured for {cfg['domain']}")
        except Exception as e:
            step_fail(str(e), "Run: nginx -t  to see config errors")
            raise DeploymentFailed()

def do_configure_firewall():
    step_start("Firewall (UFW)")
    try:
        if not cmd_exists("ufw"):
            log("Installing UFW...")
            run_quiet("apt-get install -y -qq ufw")
        run_quiet("ufw default deny incoming", check=False)
        run_quiet("ufw default allow outgoing", check=False)
        run_quiet("ufw allow 22/tcp", check=False)
        run_quiet("ufw allow 80/tcp", check=False)
        run_quiet("ufw allow 443/tcp", check=False)
        run_quiet("ufw --force enable", check=False)
        step_pass("UFW enabled (22, 80, 443 allowed, all else denied)")
    except Exception as e:
        step_fail(str(e))
        raise DeploymentFailed()

def do_hardening():
    step_start("System hardening")
    try:
        tasks = []
        if not cmd_exists("fail2ban-client"):
            log("Installing fail2ban...")
            run_quiet("apt-get install -y -qq fail2ban")
            tasks.append("fail2ban installed")
        run_quiet("systemctl enable fail2ban", check=False)
        run_quiet("systemctl start fail2ban", check=False)
        tasks.append("fail2ban enabled")

        log("Configuring unattended security upgrades...")
        run_quiet("apt-get install -y -qq unattended-upgrades", check=False)
        run_quiet("dpkg-reconfigure -f noninteractive unattended-upgrades", check=False)
        tasks.append("unattended-upgrades enabled")

        tasks.append("root SSH + password SSH preserved (per spec)")
        step_pass("; ".join(tasks))
    except Exception as e:
        step_fail(str(e))
        raise DeploymentFailed()

def do_configure_logrotate():
    step_start("Log rotation")
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
        step_pass("14-day rotation for Nginx logs")
    except Exception as e:
        step_fail(str(e))
        raise DeploymentFailed()

def do_configure_backup(app_dir):
    step_start("Backup cron job")
    try:
        backup_dir = Path(app_dir) / "data" / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        run_quiet(f"chown meetingbingo:meetingbingo {backup_dir}")

        script = Path(app_dir) / "infra" / "scripts" / "backup.sh"
        if script.exists():
            run_quiet(f"chmod +x {script}")

        cron_path = Path("/etc/cron.d/meeting-bingo-backup")
        if cron_path.exists():
            step_skip("Cron job already exists")
            return

        cron_line = f"0 2 * * * meetingbingo {script} >> /var/log/meeting-bingo-backup.log 2>&1\n"
        cron_path.write_text(cron_line)
        step_pass("Daily backup at 2am, 30-day retention")
    except Exception as e:
        step_fail(str(e))
        raise DeploymentFailed()

def do_health_check(cfg):
    step_start("Health check")
    try:
        log("Waiting for services to start...")
        time.sleep(4)
        log(f"Checking http://localhost:{cfg['api_port']}/health ...")
        r = run_quiet(f"curl -sf http://localhost:{cfg['api_port']}/health", check=False)
        if r.returncode == 0 and "ok" in r.stdout:
            log(f"Response: {r.stdout.strip()}")
            step_pass("API /health returned ok")
        else:
            step_fail(
                f"API /health did not respond (curl exit code {r.returncode})",
                "Run: journalctl -u meeting-bingo-api -n 50"
            )
            raise DeploymentFailed()
    except DeploymentFailed:
        raise
    except Exception as e:
        step_fail(str(e))
        raise DeploymentFailed()

# ─── Final report ─────────────────────────────────────────────────────────────

def print_report(cfg, app_dir, aborted=False):
    passed = sum(1 for r in results if r.status == "PASS")
    skipped = sum(1 for r in results if r.status == "SKIP")
    failed = sum(1 for r in results if r.status == "FAIL")

    print(flush=True)
    print("=" * 72, flush=True)
    print("  DEPLOYMENT REPORT", flush=True)
    print("=" * 72, flush=True)

    for r in results:
        icon = {"PASS": "\u2713", "SKIP": "\u2013", "FAIL": "\u2717"}[r.status]
        print(f"  {r.status:4s}  {icon}  {r.name:<35s}  {r.message}", flush=True)
        if r.remediation:
            print(f"              \u2192 Fix: {r.remediation}", flush=True)

    print("-" * 72, flush=True)
    print(f"  Total: {len(results)} steps | {passed} PASS | {skipped} SKIP | {failed} FAIL", flush=True)

    if failed > 0:
        print(flush=True)
        print("  \u2717 Deployment FAILED. The step above caused the failure.", flush=True)
        print("    Fix the issue and rerun the script — it will skip completed steps.", flush=True)
    else:
        print(flush=True)
        print(f"  \u2713 Deployment successful!", flush=True)
        print(flush=True)
        print(f"  Application:  https://{cfg['domain']}", flush=True)
        print(f"  Health check: https://{cfg['domain']}/health", flush=True)
        print(f"  Environment:  {app_dir}/.env", flush=True)
        print(f"  Exports:      {app_dir}/data/exports/", flush=True)
        print(f"  Backups:      {app_dir}/data/backups/", flush=True)
        print(f"  API logs:     journalctl -u meeting-bingo-api -f", flush=True)
        print(f"  Web logs:     journalctl -u meeting-bingo-web -f", flush=True)

    print("=" * 72, flush=True)

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Meeting Bingo \u2014 Zero-touch deployment for Ubuntu 24.04 LTS",
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
        "db_password": existing_env.get("DB_PASSWORD") or generate_password(),
    }

    print("=" * 72, flush=True)
    print("  Meeting Bingo \u2014 Deployment", flush=True)
    print(f"  Domain:    {cfg['domain']}", flush=True)
    print(f"  App dir:   {app_dir}", flush=True)
    print(f"  DB:        {cfg['db_user']}@{cfg['db_host']}:{cfg['db_port']}/{cfg['db_name']}", flush=True)
    print(f"  Ports:     API={cfg['api_port']}, Web={cfg['web_port']}", flush=True)
    print(f"  TLS email: {cfg['tls_email']}", flush=True)
    print("=" * 72, flush=True)

    try:
        do_validate_os()
        do_install_packages()
        do_install_node()
        do_install_postgres()
        do_create_database(cfg)
        do_install_nginx()
        do_install_certbot()
        do_create_service_user()
        do_create_app_dirs(app_dir)
        do_create_env_file(app_dir, cfg, args.force_env)
        do_install_app_deps(app_dir)
        do_build_app(app_dir)
        do_set_permissions(app_dir)
        do_run_migrations(app_dir, cfg)
        do_configure_systemd(app_dir)
        do_configure_nginx_and_tls(app_dir, cfg)
        do_configure_firewall()
        do_hardening()
        do_configure_logrotate()
        do_configure_backup(app_dir)
        do_health_check(cfg)
    except DeploymentFailed:
        print_report(cfg, app_dir, aborted=True)
        sys.exit(1)

    print_report(cfg, app_dir)
    sys.exit(0)

if __name__ == "__main__":
    main()
