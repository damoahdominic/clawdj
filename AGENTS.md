# ClawDJ — Agent & Deployment Guide

Live URL: **https://clawdj.live/**

---

## Architecture Overview

```
Internet → NGINX (443 SSL) → clawdj.live
                │
                ├── /          → Next.js frontend   :3004
                ├── /api/      → FastAPI backend     :8004
                ├── /health    → FastAPI backend     :8004
                └── /ws/       → FastAPI WebSocket   :8004
```

Both services are managed by **PM2** (`ecosystem.config.js`) and run on `localhost` — NGINX is the only public-facing process.

---

## Services

### Frontend — Next.js 14
- **Port:** 3004
- **Root:** `./frontend/`
- **Runtime:** Node.js
- **PM2 name:** `clawdj-frontend`
- **Env:** `NODE_ENV=production`, `NEXT_PUBLIC_API_URL=http://localhost:8004`
- **Start cmd:** `next start -p 3004`

Key libraries: React 18, MUI 6, Three.js, WaveSurfer.js, Tailwind CSS.

### Backend — FastAPI / uvicorn
- **Port:** 8004
- **Root:** `./backend/`
- **Runtime:** Python 3 (virtualenv at `./venv/`)
- **PM2 name:** `clawdj-backend`
- **Start cmd:** `scripts/start-backend.sh` → `uvicorn main:app --host 0.0.0.0 --port 8004`
- **Process note:** launched via `sg docker` so the process runs in the `docker` group (needed for container access).

Key libraries: FastAPI 0.115, Demucs 4 (stem separation), librosa (BPM/key analysis), yt-dlp (YouTube download), pydub (audio export).

---

## NGINX Configuration

Config file: `/etc/nginx/sites-enabled/clawdj.live`

```nginx
server {
    server_name clawdj.live www.clawdj.live;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3004;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:8004;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
        client_max_body_size 100M;
    }

    location /health {
        proxy_pass http://127.0.0.1:8004;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://127.0.0.1:8004;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 300s;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/clawdj.live/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/clawdj.live/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

# HTTP → HTTPS redirect
server {
    listen 80;
    server_name clawdj.live www.clawdj.live;
    return 301 https://$host$request_uri;
}
```

SSL certificates are managed by **Certbot / Let's Encrypt** and auto-renew via the system cron.

---

## Process Management (PM2)

```bash
# View running processes
pm2 list

# Restart everything
pm2 restart ecosystem.config.js

# Restart individual service
pm2 restart clawdj-frontend
pm2 restart clawdj-backend

# View logs
pm2 logs clawdj-frontend
pm2 logs clawdj-backend

# Save process list so it survives reboots
pm2 save
```

---

## Deployment Workflow

```bash
# 1. Pull latest code
git pull

# 2. Frontend — rebuild
cd frontend
npm install
npm run build
cd ..

# 3. Restart via PM2
pm2 restart ecosystem.config.js

# 4. (If NGINX config changed)
sudo nginx -t && sudo systemctl reload nginx
```

---

## Local Paths

| Resource | Path |
|---|---|
| Music library | `~/music/` |
| Radio tracks | `~/music/radio/` |
| Mashup outputs | `~/music/mashups/` |
| Stems (temp) | `/tmp/clawdj_stems/` |
| Library index | `~/.clawdj/library.json` |
| Session state | `~/.clawdj/session.json` |
| YT cookies | `~/.anysong/cookies.txt` |
| anysong binary | `~/Workspace/anysong/anysong` |

---

## GitHub Repository

- **Repo:** https://github.com/damoahdominic/clawdj
- **Account:** `damoahdominic`
- **Remote protocol:** HTTPS (configured in `git remote`)
- **Auth:** `gh auth login --with-token` using a GitHub PAT stored by the `gh` CLI (`~/.config/gh/hosts.yml`). The token needs `repo` and `workflow` scopes at minimum.
- **Push:** `git push origin master` — the `gh` CLI credential helper handles authentication automatically once logged in.

---

## Agent Notes

- API base for agents calling the backend: `https://clawdj.live/api/`
- WebSocket endpoint: `wss://clawdj.live/ws/`
- Health check: `GET https://clawdj.live/health`
- The backend accepts large file uploads (up to 100 MB per NGINX config).
- Long-running operations (stem separation, mashup render) use async jobs polled via the REST API — do not set short HTTP timeouts; backend read timeout is 300 s.
- YouTube cookie refresh is handled by `scripts/refresh-yt-cookies.sh` — run it if yt-dlp downloads start failing.
- After completing any coding task, always commit the changes and push to `origin master`.
