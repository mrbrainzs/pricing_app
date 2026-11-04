#!/bin/bash
# Run as root from this directory after inspecting the existing host.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x /opt/quinsuper-node/bin/node ]; then
  work=$(mktemp -d /tmp/quinsuper-node.XXXXXX)
  curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$work/SHASUMS256.txt"
  file=$(awk '/node-v22\.[0-9]+\.[0-9]+-linux-x64.tar.xz$/ {print $2}' "$work/SHASUMS256.txt")
  test -n "$file"
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/$file" -o "$work/$file"
  (cd "$work"; grep " $file$" SHASUMS256.txt | sha256sum -c -)
  install -d -m 755 /opt/quinsuper-node
  tar -xJf "$work/$file" -C /opt/quinsuper-node --strip-components=1
fi
/opt/quinsuper-node/bin/node --version
install -d -m 755 /var/www/quinsuper/releases /var/lib/quinsuper-deploy /usr/local/lib/quinsuper
install -d -o www-data -g www-data -m 700 /var/lib/quinsuper
install -d -m 700 /var/backups/quinsuper
install -m 755 update.sh /usr/local/sbin/quinsuper-update
install -m 644 backup.py /usr/local/lib/quinsuper/backup.py
install -m 644 quinsuper-*.service quinsuper-*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable quinsuper-api.service
if [ ! -e /etc/nginx/sites-available/quinsuper ]; then
  install -m 644 nginx.conf /etc/nginx/sites-available/quinsuper
  ln -s /etc/nginx/sites-available/quinsuper /etc/nginx/sites-enabled/quinsuper
fi
nginx -t
systemctl reload nginx
certbot certonly --webroot -w /var/www/letsencrypt -d quinsuper.trottedmedia.com --non-interactive --agree-tos --register-unsafely-without-email
python3 - <<'PY'
from pathlib import Path
p = Path('/etc/nginx/sites-available/quinsuper')
text = p.read_text()
if 'listen 443 ssl;' not in text:
    text = text.replace('    listen 80;\n    listen [::]:80;', '''    listen 443 ssl;
    listen [::]:443 ssl;
    ssl_certificate /etc/letsencrypt/live/quinsuper.trottedmedia.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/quinsuper.trottedmedia.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;''')
    text += '''\nserver {
    listen 80;
    listen [::]:80;
    server_name quinsuper.trottedmedia.com;
    location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
    location / { return 301 https://$host$request_uri; }
}\n'''
    p.write_text(text)
PY
nginx -t
systemctl reload nginx
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nnginx -t && systemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/quinsuper-nginx
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/quinsuper-nginx
echo 'Provisioned. Activate the first release, then enable update/import/backup timers.'
