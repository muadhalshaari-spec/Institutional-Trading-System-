#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/institutional-trading-system"
SERVICE_DIR="/etc/institutional-trading-system"
REPO_URL="https://github.com/muadhalshaari-spec/Institutional-Trading-System-.git"

sudo apt-get update
sudo apt-get install -y ca-certificates curl git build-essential

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

sudo useradd --system --create-home --shell /usr/sbin/nologin its 2>/dev/null || true
sudo mkdir -p "$APP_DIR" "$SERVICE_DIR" /var/lib/institutional-trading-system
sudo chown -R its:its "$APP_DIR" /var/lib/institutional-trading-system

if [ ! -d "$APP_DIR/.git" ]; then
  sudo -u its git clone "$REPO_URL" "$APP_DIR"
else
  sudo -u its git -C "$APP_DIR" fetch origin main
  sudo -u its git -C "$APP_DIR" reset --hard origin/main
fi

sudo -u its bash -lc "cd '$APP_DIR' && npm install && npm run build"

if [ ! -f "$SERVICE_DIR/collector.env" ]; then
  sudo cp "$APP_DIR/محرك المنصات/deploy/systemd/collector.env.example" "$SERVICE_DIR/collector.env"
  sudo chmod 600 "$SERVICE_DIR/collector.env"
  echo "Edit $SERVICE_DIR/collector.env before starting the service."
fi

sudo cp "$APP_DIR/محرك المنصات/deploy/systemd/collector.service" /etc/systemd/system/institutional-trading-system.service
sudo systemctl daemon-reload
sudo systemctl enable institutional-trading-system.service

echo "Installation complete. Apply Supabase SQL, edit $SERVICE_DIR/collector.env, then:"
echo "  sudo systemctl start institutional-trading-system.service"
