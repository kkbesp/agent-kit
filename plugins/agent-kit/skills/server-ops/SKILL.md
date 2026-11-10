---
name: server-ops
description: Senior-sysadmin workflow for Linux servers and VPS reached over SSH — diagnosing outages and alerts, systemd services, journald logs, Docker/Compose deployments, nginx/Caddy reverse proxy and TLS, firewall, disk/memory pressure, backups, safe config changes with rollback. Use for any task on a remote server or production/staging host. Triggers: сервер, сервак, VPS, впс, прод, стейдж, алерты, nginx, docker compose, systemd, деплой, упал, не отвечает, место на диске.
---

# Server operations

Act like the on-call SRE who will be paged if this breaks: observe first, change one thing, verify, keep a way back. Shell mechanics (quoting, SSH flags, waiting) are in `terminal-ops`.

## Before touching anything

1. Confirm the target: `ssh host 'hostname; whoami; uptime; cat /etc/os-release | head -2'`. Production changes need the owner's explicit permission in this task; diagnosis does not.
2. Read the state, do not guess it. Start with the cheapest signals:
   ```sh
   systemctl --failed; df -h /; free -m; uptime
   journalctl -p warning --since '-1h' --no-pager | tail -50
   docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
   ss -ltnp
   ```
3. For a specific service: `systemctl status <unit> --no-pager -l`, `journalctl -u <unit> --since '-30min' --no-pager | tail -100`, `docker logs --since 30m --tail 200 <name>`.
4. Write down the hypothesis and the evidence that would confirm it before acting (skill `systematic-debugging`).

## Changing things safely

- Back up before editing: `cp -a file file.bak.$(date +%Y%m%d%H%M%S)`. Validate before reload: `nginx -t`, `caddy validate`, `sshd -t`, `docker compose config -q`, `systemd-analyze verify unit`.
- Prefer reload over restart (`systemctl reload nginx`), and one service at a time. After the change, verify the user-facing path (`curl -fsS -o /dev/null -w '%{http_code} %{time_total}\n' https://host/health`), not only that the process is up.
- Configuration lives in the repository (compose files, unit files, nginx configs, `.env.example`) and is deployed from there. A hand edit on the server is either reverted or committed back the same day.
- Docker: pin image tags or digests, `restart: unless-stopped`, healthchecks, named volumes for data, logs with rotation (`logging: max-size`). `docker compose up -d --wait` waits for health. Never `docker system prune -a --volumes` on a server with data.
- systemd units: `Restart=on-failure`, `User=` not root, `EnvironmentFile=` for secrets with mode 600, hardening (`NoNewPrivileges=yes`, `ProtectSystem=strict`, `PrivateTmp=yes`) where the service allows.
- Firewall: allow SSH first, then enable (`ufw allow OpenSSH && ufw enable`). A change that may lock you out of SSH needs a timed rollback (`at now + 5 min`) or provider console access first.
- Secrets never go to the command line, shell history or logs; use files with restricted permissions or the secret manager (skill `secrets-management`).

## Disk, memory, logs

- Disk: `du -xh --max-depth=1 / 2>/dev/null | sort -h | tail`, `journalctl --disk-usage`, `docker system df`. Free space with targeted cleanup (`journalctl --vacuum-time=14d`, removing old images by tag) and fix the cause (log rotation, retention), not just the symptom.
- Memory: `ps aux --sort=-rss | head`, `dmesg -T | grep -i -E 'oom|killed process'`.

## Alerts and incidents

1. Is the user-facing service down? Restore service first (rollback to the last good release, restart the failed unit), then investigate.
2. Find the first error in time order, not the loudest one.
3. Fix the root cause in the repository, deploy through the normal path, and confirm the alert clears.
4. Leave a short note in the project's existing incident or ops document: symptom, cause, fix, prevention.

## Done means

The owner-visible check passes (HTTP status, bot answers, page loads), the change is in the repository, backups or rollback are known, and the report names the commands and their exit codes.
