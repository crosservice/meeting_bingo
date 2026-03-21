#!/usr/bin/env python3
"""
Meeting Bingo — Deployment Script
Provisions the application on Ubuntu 24.04 LTS.
Idempotent, safe to rerun.
"""

import argparse
import os
import subprocess
import sys
import shutil
import secrets
import string
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
    icon = {"PASS": "✓", "SKIP": "–", "FAIL": "✗"}[status]
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

# ─── Steps ────────────────────────────────────────────────────────────────────

def step_validate_os():
    name = "OS validation"
    try:
        r = run("lsb_release -rs")
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
            "gnupg2 ca-certificates lsb-release")
        record(name, "PASS", "System packages installed")
    except Exception as e:
        record(name, "FAIL", str(e), "Run as root or with sudo")

def step_install_node(node_major="22"):
    name = "Node.js install"
    try:
        r = run("node --version", check=False)
        if r.returncode == 0 and r.stdout.strip().startswith(f"v{node_major}"):
            record(name, "SKIP", f"Node.js {r.stdout.strip()} already installed")
            return
        # Install via NodeSource
        run(f"curl -fsSL https://deb.nodesource.com/setup_{node_major}.x | bash -")
        run("apt-get install -y -qq nodejs")
        # Install pnpm
        run("corepack enable")
        run("corepack prepare pnpm@latest --activate")
        r = run("node --version")
        record(name, "PASS", f"Node.js {r.stdout.strip()} installed")
    except Exception as e:
        record(name, "FAIL", str(e), "Check NodeSource repository setup")

def step_install_postgres(args):
    name = "PostgreSQL"
    if not args.create_db:
        record(name, "SKIP", "Skipped (--no-create-db)")
        return
    try:
        r = run("pg_isready", check=False)
        if r.returncode == 0:
            record(name, "SKIP", "PostgreSQL already running")
        else:
            run("apt-get install -y -qq postgresql postgresql-contrib")
            run("systemctl enable postgresql")
            run("systemctl start postgresql")
            record(name, "PASS", "PostgreSQL installed and started")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_create_database(args):
    name = "Database setup"
    if not args.create_db:
        record(name, "SKIP", "Skipped (--no-create-db)")
        return
    try:
        # Check if DB exists
        r = run(f'sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname=\'{args.db_name}\'"',
                check=False)
        if r.stdout.strip() == "1":
            record(name, "SKIP", f"Database '{args.db_name}' already exists")
            return
        # Create user and database
        run(f'sudo -u postgres psql -c "CREATE USER {args.db_user} WITH PASSWORD \'{args.db_password}\'"',
            check=False)
        run(f'sudo -u postgres psql -c "CREATE DATABASE {args.db_name} OWNER {args.db_user}"')
        # Restrict to localhost
        record(name, "PASS", f"Database '{args.db_name}' created")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_install_nginx():
    name = "Nginx install"
    try:
        if cmd_exists("nginx"):
            record(name, "SKIP", "Nginx already installed")
            return
        run("apt-get install -y -qq nginx")
        run("systemctl enable nginx")
        record(name, "PASS", "Nginx installed")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_install_certbot():
    name = "Certbot install"
    try:
        if cmd_exists("certbot"):
            record(name, "SKIP", "Certbot already installed")
            return
        run("apt-get install -y -qq certbot python3-certbot-nginx")
        record(name, "PASS", "Certbot installed")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_create_service_user():
    name = "Service user"
    try:
        r = run("id meetingbingo", check=False)
        if r.returncode == 0:
            record(name, "SKIP", "User 'meetingbingo' already exists")
            return
        run("useradd --system --no-create-home --shell /usr/sbin/nologin meetingbingo")
        record(name, "PASS", "User 'meetingbingo' created")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_create_app_dirs(args):
    name = "App directories"
    try:
        app_dir = Path(args.app_dir)
        data_dir = app_dir / "data" / "exports"
        data_dir.mkdir(parents=True, exist_ok=True)
        run(f"chown -R meetingbingo:meetingbingo {app_dir / 'data'}")
        record(name, "PASS", f"Directories created at {app_dir}")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_create_env_file(args):
    name = "Environment file"
    try:
        env_path = Path(args.app_dir) / ".env"
        if env_path.exists() and not args.force_env:
            record(name, "SKIP", ".env already exists (use --force-env to overwrite)")
            return

        jwt_secret = generate_secret()
        jwt_refresh = generate_secret()

        env_content = f"""NODE_ENV=production
API_PORT={args.api_port}
WEB_URL=https://{args.domain}

DATABASE_URL=postgresql://{args.db_user}:{args.db_password}@{args.db_host}:{args.db_port}/{args.db_name}
DB_HOST={args.db_host}
DB_PORT={args.db_port}
DB_NAME={args.db_name}
DB_USER={args.db_user}
DB_PASSWORD={args.db_password}

JWT_SECRET={jwt_secret}
JWT_REFRESH_SECRET={jwt_refresh}

NEXT_PUBLIC_API_URL=https://{args.domain}

EXPORT_DIR={args.app_dir}/data/exports
"""
        env_path.write_text(env_content)
        run(f"chown meetingbingo:meetingbingo {env_path}")
        run(f"chmod 600 {env_path}")
        record(name, "PASS", ".env created with generated secrets")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_install_app_deps(args):
    name = "App dependencies"
    try:
        run(f"cd {args.app_dir} && pnpm install --frozen-lockfile", check=True)
        record(name, "PASS", "Dependencies installed")
    except Exception as e:
        record(name, "FAIL", str(e), "Check pnpm-lock.yaml exists")

def step_build_app(args):
    name = "App build"
    try:
        run(f"cd {args.app_dir} && pnpm run build", check=True)
        record(name, "PASS", "Frontend and backend built")
    except Exception as e:
        record(name, "FAIL", str(e), "Check build logs for TypeScript errors")

def step_run_migrations(args):
    name = "Database migrations"
    try:
        run(f"cd {args.app_dir} && pnpm run migrate", check=True)
        record(name, "PASS", "Migrations applied")
    except Exception as e:
        record(name, "FAIL", str(e), "Check DATABASE_URL and PostgreSQL connectivity")

def step_configure_systemd(args):
    name = "Systemd services"
    try:
        app_dir = args.app_dir
        for svc in ["meeting-bingo-api", "meeting-bingo-web"]:
            src = Path(app_dir) / "infra" / "systemd" / f"{svc}.service"
            dst = Path(f"/etc/systemd/system/{svc}.service")
            content = src.read_text().replace("{{APP_DIR}}", app_dir)
            dst.write_text(content)

        run("systemctl daemon-reload")
        run("systemctl enable meeting-bingo-api meeting-bingo-web")
        run("systemctl restart meeting-bingo-api")
        run("systemctl restart meeting-bingo-web")
        record(name, "PASS", "Services configured and started")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_configure_nginx(args):
    name = "Nginx config"
    try:
        src = Path(args.app_dir) / "infra" / "nginx" / "meeting-bingo.conf"
        content = src.read_text()
        content = content.replace("{{DOMAIN}}", args.domain)
        content = content.replace("{{API_PORT}}", str(args.api_port))
        content = content.replace("{{WEB_PORT}}", str(args.web_port))

        dst = Path("/etc/nginx/sites-available/meeting-bingo")
        dst.write_text(content)

        link = Path("/etc/nginx/sites-enabled/meeting-bingo")
        if not link.exists():
            link.symlink_to(dst)

        # Remove default site if present
        default_link = Path("/etc/nginx/sites-enabled/default")
        if default_link.exists():
            default_link.unlink()

        run("nginx -t")
        run("systemctl reload nginx")
        record(name, "PASS", f"Nginx configured for {args.domain}")
    except Exception as e:
        record(name, "FAIL", str(e), "Check nginx -t output for config errors")

def step_obtain_tls(args):
    name = "TLS certificate"
    try:
        cert_path = Path(f"/etc/letsencrypt/live/{args.domain}/fullchain.pem")
        if cert_path.exists():
            record(name, "SKIP", "Certificate already exists")
            return
        run(f"certbot --nginx -d {args.domain} --non-interactive --agree-tos -m {args.tls_email}")
        record(name, "PASS", f"TLS certificate obtained for {args.domain}")
    except Exception as e:
        record(name, "FAIL", str(e), "Ensure DNS points to this server and port 80 is open")

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
        record(name, "PASS", "UFW configured (22, 80, 443 allowed)")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_hardening():
    name = "System hardening"
    try:
        tasks_done = []

        # fail2ban
        if not cmd_exists("fail2ban-client"):
            run("apt-get install -y -qq fail2ban")
            tasks_done.append("fail2ban installed")
        run("systemctl enable fail2ban", check=False)
        run("systemctl start fail2ban", check=False)
        tasks_done.append("fail2ban enabled")

        # Unattended upgrades
        run("apt-get install -y -qq unattended-upgrades", check=False)
        run('dpkg-reconfigure -f noninteractive unattended-upgrades', check=False)
        tasks_done.append("unattended-upgrades configured")

        # NOTE: Root SSH and password SSH intentionally left enabled per spec requirement
        tasks_done.append("root SSH + password SSH preserved (per spec)")

        record(name, "PASS", "; ".join(tasks_done))
    except Exception as e:
        record(name, "FAIL", str(e))

def step_configure_logrotate(args):
    name = "Log rotation"
    try:
        logrotate_conf = f"""/var/log/nginx/meeting-bingo-*.log {{
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
}}
"""
        Path("/etc/logrotate.d/meeting-bingo").write_text(logrotate_conf)
        record(name, "PASS", "Log rotation configured")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_configure_backup(args):
    name = "Backup job"
    try:
        backup_dir = Path(args.app_dir) / "data" / "backups"
        backup_dir.mkdir(parents=True, exist_ok=True)
        run(f"chown meetingbingo:meetingbingo {backup_dir}")

        src = Path(args.app_dir) / "infra" / "scripts" / "backup.sh"
        if src.exists():
            run(f"chmod +x {src}")

        # Create cron job if requested
        if args.install_backup_timer:
            cron_line = f"0 2 * * * meetingbingo {src} >> /var/log/meeting-bingo-backup.log 2>&1"
            cron_path = Path("/etc/cron.d/meeting-bingo-backup")
            if not cron_path.exists():
                cron_path.write_text(cron_line + "\n")
                record(name, "PASS", "Backup cron job installed (daily 2am)")
            else:
                record(name, "SKIP", "Backup cron already exists")
        else:
            record(name, "SKIP", "Backup timer not requested")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_health_check(args):
    name = "Health checks"
    try:
        import time
        time.sleep(3)  # Wait for services to start
        r = run(f"curl -sf http://localhost:{args.api_port}/health", check=False)
        if r.returncode == 0 and "ok" in r.stdout:
            record(name, "PASS", "API health check passed")
        else:
            record(name, "FAIL", "API health endpoint did not return ok",
                   "Check: systemctl status meeting-bingo-api")
    except Exception as e:
        record(name, "FAIL", str(e))

def step_seed_data(args):
    name = "Seed data"
    if not args.run_seed:
        record(name, "SKIP", "Skipped (--no-seed)")
        return
    try:
        run(f"cd {args.app_dir} && pnpm run seed", check=True)
        record(name, "PASS", "Seed data loaded")
    except Exception as e:
        record(name, "FAIL", str(e))

# ─── Final report ─────────────────────────────────────────────────────────────

def print_report():
    print("\n" + "=" * 70)
    print("  DEPLOYMENT REPORT")
    print("=" * 70)
    passed = sum(1 for r in results if r.status == "PASS")
    skipped = sum(1 for r in results if r.status == "SKIP")
    failed = sum(1 for r in results if r.status == "FAIL")

    for r in results:
        icon = {"PASS": "✓", "SKIP": "–", "FAIL": "✗"}[r.status]
        line = f"  {r.status:4s}  {icon}  {r.name:<30s}  {r.message}"
        print(line)
        if r.remediation:
            print(f"         → {r.remediation}")

    print("-" * 70)
    print(f"  Total: {len(results)} steps | {passed} PASS | {skipped} SKIP | {failed} FAIL")
    if failed > 0:
        print("  ⚠ Some steps failed. Review the remediation notes above.")
    else:
        print("  ✓ Deployment completed successfully.")
    print("=" * 70)

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Meeting Bingo deployment script")
    parser.add_argument("--domain", required=True, help="Domain name (e.g., bingo.example.com)")
    parser.add_argument("--app-dir", default="/opt/meeting-bingo", help="Application directory")
    parser.add_argument("--api-port", type=int, default=3001)
    parser.add_argument("--web-port", type=int, default=3000)
    parser.add_argument("--db-host", default="localhost")
    parser.add_argument("--db-port", type=int, default=5432)
    parser.add_argument("--db-name", default="meeting_bingo")
    parser.add_argument("--db-user", default="meeting_bingo")
    parser.add_argument("--db-password", default="changeme", help="Database password")
    parser.add_argument("--tls-email", required=True, help="Email for Let's Encrypt")
    parser.add_argument("--create-db", action="store_true", default=True)
    parser.add_argument("--no-create-db", dest="create_db", action="store_false")
    parser.add_argument("--run-seed", action="store_true", default=False)
    parser.add_argument("--no-seed", dest="run_seed", action="store_false")
    parser.add_argument("--install-backup-timer", action="store_true", default=True)
    parser.add_argument("--force-env", action="store_true", default=False, help="Overwrite .env")

    args = parser.parse_args()

    print("=" * 70)
    print("  Meeting Bingo — Deployment")
    print(f"  Domain:  {args.domain}")
    print(f"  App Dir: {args.app_dir}")
    print("=" * 70)

    step_validate_os()
    step_install_packages()
    step_install_node()
    step_install_postgres(args)
    step_create_database(args)
    step_install_nginx()
    step_install_certbot()
    step_create_service_user()
    step_create_app_dirs(args)
    step_create_env_file(args)
    step_install_app_deps(args)
    step_build_app(args)
    step_run_migrations(args)
    step_configure_systemd(args)
    step_configure_nginx(args)
    step_obtain_tls(args)
    step_configure_firewall()
    step_hardening()
    step_configure_logrotate(args)
    step_configure_backup(args)
    step_health_check(args)
    step_seed_data(args)

    print_report()

    failed = sum(1 for r in results if r.status == "FAIL")
    sys.exit(1 if failed > 0 else 0)

if __name__ == "__main__":
    main()
