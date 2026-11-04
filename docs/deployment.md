# QuinSuper deployment

Target: https://quinsuper.trottedmedia.com on 204.168.165.248.
Deployment branch: claude/cabas-scaffold (current repository default).
Workflow: .github/workflows/deploy.yml.

## Current status

The workflow has been committed. Server provisioning, TLS, SSH credentials,
Supabase setup and end-to-end verification have NOT been completed.
The app currently uses sample data; adding import secrets alone does not connect
the app to real prices.

## Server preparation

Inspect the existing OS, web server, virtual hosts, firewall and free space first.
Do not replace existing configurations or install a competing web server.
For a Debian/Ubuntu host already using Nginx, provision a dedicated deployment
account and directories:

```sh
adduser --disabled-password --gecos '' quinsuper
install -d -o quinsuper -g quinsuper -m 755 /var/www/quinsuper
install -d -o quinsuper -g quinsuper -m 755 /var/www/quinsuper/releases /var/www/quinsuper/incoming
install -d -o quinsuper -g quinsuper -m 700 /home/quinsuper/.ssh
```

Generate a dedicated Ed25519 key for GitHub Actions; install only its public key
in /home/quinsuper/.ssh/authorized_keys (owner quinsuper, mode 600).
Use the authorized_keys options restrict,command if a reviewed forced-command
deployment wrapper is introduced; otherwise use restrict to disable forwarding
and PTY while allowing the workflow's shell/scp operations.
Do not upload the personal root key or .ppk file to the repository.

GitHub Actions secrets:
- QUINSUPER_DEPLOY_KEY: dedicated OpenSSH private key, not PuTTY PPK.
- QUINSUPER_KNOWN_HOSTS: verified SSH host-key entry for 204.168.165.248.
Verify the fingerprint through a trusted server console before accepting it.
Never disable SSH host-key verification.

The deployment user needs no sudo. Each deployment uploads a release and
atomically switches /var/www/quinsuper/current. Old releases are retained for
manual rollback; monitor disk usage and establish a retention policy.

## Web server and TLS

Create a separate virtual host with this core configuration, adapted to the
existing server. Validate with nginx -t before reloading.

```nginx
server {
    listen 80;
    server_name quinsuper.trottedmedia.com;
    root /var/www/quinsuper/current;
    index index.html;

    # Keep preview restricted until the requested legal review is completed.
    auth_basic "QuinSuper preview";
    auth_basic_user_file /etc/nginx/quinsuper.htpasswd;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    location ~ /\. {
        deny all;
    }
}
```

Create the preview password file securely using htpasswd; never commit it.
Provision a valid certificate using the server's existing ACME tooling; use
DNS validation or an explicitly accessible ACME challenge location when HTTP
authentication is enabled. Redirect HTTP to HTTPS once TLS works.

The workflow's HTTPS check expects HTTP 200. While preview authentication is
enabled, change that check to assert the expected 401 response or configure
a narrowly scoped health endpoint returning 200 without exposing the app.
Do not remove preview protection solely to satisfy a health check.

## Supabase

Create a project in the owner's Supabase organization and apply
supabase/migrations/20261104000000_init.sql after review. Configure auth
providers required by the features actually being released.

Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as GitHub Actions secrets
for the existing Daily prices workflow. The service-role key is server-only:
never prefix it EXPO_PUBLIC_, embed it in the web build, or log it.

Before enabling imports, verify the chain-specific collection permissions
and obtain the requested legal advice. Run a bounded manual import, inspect
the stored rows and timestamps, then verify the daily schedule.

A separate app data-source implementation is still required to display the
stored prices. Add Bonpreu/Esclat, Caprabo, bonÀrea, DIA and Alcampo importers
as separate reviewed changes.

## Launch prerequisites

Complete docs/prelaunch-review.md and verify HTTPS, deep links, authentication,
real data behaviour, scheduled imports and rollback before public launch.
