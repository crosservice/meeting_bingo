# Operational Runbook

## Service Management

```bash
# Check status
systemctl status meeting-bingo-api
systemctl status meeting-bingo-web

# Restart services
sudo systemctl restart meeting-bingo-api
sudo systemctl restart meeting-bingo-web

# View logs
journalctl -u meeting-bingo-api -f
journalctl -u meeting-bingo-web -f
journalctl -u meeting-bingo-api --since "1 hour ago"
```

## Health Checks

```bash
# API health
curl -s http://localhost:3001/health | jq

# API readiness (includes DB check)
curl -s http://localhost:3001/health/ready | jq

# External check
curl -s https://your-domain.com/health | jq
```

## Database

```bash
# Connect to database
sudo -u postgres psql meeting_bingo

# Check migrations
sudo -u postgres psql meeting_bingo -c "SELECT * FROM _migrations ORDER BY id;"

# Run new migrations
cd /opt/meeting-bingo && pnpm run migrate

# Manual backup
sudo -u meetingbingo /opt/meeting-bingo/infra/scripts/backup.sh

# Restore from backup
gunzip -c /opt/meeting-bingo/data/backups/meeting_bingo_YYYYMMDD_HHMMSS.sql.gz | \
  sudo -u postgres psql meeting_bingo
```

## TLS Certificate

```bash
# Check certificate expiry
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal

# Certbot auto-renews via systemd timer
systemctl list-timers | grep certbot
```

## Secret Rotation

```bash
# Generate new JWT secrets
NEW_SECRET=$(openssl rand -base64 48)

# Edit .env
sudo -u meetingbingo nano /opt/meeting-bingo/.env

# Restart API (sessions will be invalidated)
sudo systemctl restart meeting-bingo-api
```

## Troubleshooting

### API won't start
```bash
journalctl -u meeting-bingo-api --no-pager -n 50
# Common: DATABASE_URL wrong, port conflict, missing .env
```

### Database connection failed
```bash
sudo -u postgres pg_isready
sudo systemctl status postgresql
# Check: DB_HOST, DB_PORT, DB_PASSWORD in .env
```

### Nginx 502 Bad Gateway
```bash
# Check if backend is running
curl http://localhost:3001/health
# Check nginx error log
tail -20 /var/log/nginx/meeting-bingo-error.log
```

### WebSocket not connecting
```bash
# Check nginx config has WebSocket upgrade headers
nginx -t
# Check firewall allows 443
sudo ufw status
```

## Updating the Application

```bash
cd /opt/meeting-bingo
git pull origin main
pnpm install --frozen-lockfile
pnpm run build
pnpm run migrate
sudo systemctl restart meeting-bingo-api
sudo systemctl restart meeting-bingo-web
```
