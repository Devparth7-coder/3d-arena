# ARENA — Deployment Guide

This guide covers deploying the **current build** (static client, Milestone 1) to
**Vercel** and **Render**, plus the plan for the **Phase 7 game server** (which will
live on Render, not Vercel — see §7).

> **What you are deploying today:** a purely static Vite bundle (`dist/`).
> There is no backend, no database, and no environment variables required.
> The whole game — simulation, AI, audio synthesis — runs in the browser.

---

## 0. Prerequisites

- **Node.js ≥ 20** and npm locally.
- The repository pushed to **GitHub / GitLab / Bitbucket** (required for Git-based
  deploys on both platforms). If starting from a fresh clone:

  ```bash
  git init
  git add .
  git commit -m "ARENA milestone 1"
  git remote add origin git@github.com:<you>/arena.git
  git push -u origin main
  ```

- Deploy config files are already in the repo:
  | File | Platform | Purpose |
  | --- | --- | --- |
  | `vercel.json` | Vercel | Build settings + cache headers for assets/models/fonts |
  | `render.yaml` | Render | Blueprint (one-click static site setup) |
  | `package.json → engines` | both | Documents the Node ≥ 20 requirement |

---

## 1. Pre-flight: verify the production build locally

Run this before every deploy. It is the exact command both platforms will run.

```bash
npm ci          # clean install from the lockfile
npm run build   # typecheck (strict TS) + bundle → dist/
npm run preview # serve dist/ at http://localhost:4173
```

Smoke-test in a browser: menu renders → **VS CPU** → round starts → attacks deal
damage (`U/I/J/K`) → ESC pauses.

What the bundle contains (verified):

```
dist/
  index.html                       0.9 kB
  assets/index-<hash>.js        1,160 kB  (323 kB gzipped)
  assets/index-<hash>.css         15 kB   (  4 kB gzipped)
  models/RobotExpressive.glb     464 kB   (fighter model, CC-BY)
  fonts/chakra-*.woff2            50 kB   (self-hosted)
```

---

## 2. Deploy to Vercel

### 2.1 Via the dashboard (recommended)

1. Go to [vercel.com/new](https://vercel.com/new) and **import** your Git repository.
2. Vercel auto-detects **Vite**. Confirm/adjust:
   | Setting | Value |
   | --- | --- |
   | Framework Preset | Vite |
   | Build Command | `npm run build` *(from `vercel.json`)* |
   | Output Directory | `dist` *(from `vercel.json`)* |
   | Install Command | leave default (lockfile is detected) |
   | Node.js Version | default (≥ 20) — or pin 20.x in *Settings → General* |
3. Click **Deploy**. First build takes ~1–2 minutes.
4. You get `https://arena-<you>.vercel.app` plus a **preview URL for every push/PR**
   automatically.

### 2.2 Via the CLI

```bash
npm i -g vercel
vercel          # first time: link the project, accept defaults
vercel --prod   # promote to production
```

### 2.3 What `vercel.json` does

- Declares build command / output directory (matches the auto-detected values —
  explicit is better than implicit).
- Cache headers:
  - `/assets/*` → `max-age=31536000, immutable` — filenames are content-hashed,
    so they can be cached forever.
  - `/models/*` → 1 day + stale-while-revalidate (not hashed; changes when the
    model changes).
  - `/fonts/*` → 7 days + stale-while-revalidate.

### 2.4 Custom domain

*Settings → Domains → Add.* Point your DNS at Vercel (A record `76.76.21.21` or
CNAME to `cname.vercel-dns.com` — Vercel shows exact values per domain).
HTTPS certificates are provisioned automatically.

### 2.5 Notes specific to this app

- **No rewrites needed** — the app has no client-side routes; every screen is
  application state, and the dev/test hashes (`#play`, `#ko`) are plain URL
  fragments, invisible to the server.
- **No environment variables** are read at build time today.
- Vercel serves Brotli/Gzip automatically; total first-load transfer is
  **~800 kB** (HTML + JS gzip + model + fonts + CSS gzip).

---

## 3. Deploy to Render (Static Site)

### 3.1 Via the dashboard

1. Go to [render.com](https://render.com) → **New → Static Site**.
2. Connect your Git repository.
3. Settings:
   | Setting | Value |
   | --- | --- |
   | Name | `arena` |
   | Branch | `main` |
   | Build Command | `npm run build` |
   | Publish Directory | `dist` |
4. *Environment* → add **`NODE_VERSION=20.20.2`** (Render's build image defaults
   may differ; pinning avoids surprises with the strict-TypeScript build).
5. **Create Static Site.** You get `https://arena.onrender.com`.

### 3.2 Via the Blueprint (`render.yaml`)

The repo contains a `render.yaml` that encodes everything above:

1. Render dashboard → **New → Blueprint** → select the repository.
2. Render reads `render.yaml` and provisions the `arena-client` static site
   (build command, publish dir, `NODE_VERSION`, cache headers, SPA fallback).
3. Apply. Done — future pushes to `main` auto-deploy.

### 3.3 Important: keep devDependencies

The build script runs `tsc --noEmit` **before** Vite, so `typescript`,
`vite`, and friends (all devDependencies) must be installed during build.

- ⚠️ **Do not set `NODE_ENV=production`** on the static site — it makes npm skip
  devDependencies and the build fails at the typecheck step. Both platforms
  install them by default.

### 3.4 Custom domain

*Settings → Custom Domains → Add.* Add the DNS record Render shows
(CNAME to `<service>.onrender.com`). HTTPS is automatic.

### 3.5 Free-tier behavior

Free static sites on Render sleep/spin-down is a **web-service** trait; static
sites are served from a CDN and do not have cold starts. (Check current plan
limits — they change over time.)

---

## 4. Environment variables

**None required for the current build.** The game is fully offline: no API keys,
no analytics, no feature flags. When they appear, they will be `VITE_*`-prefixed
(Vite requirement) and documented here.

---

## 5. Performance & asset notes

- First load ≈ **800 kB transfer** (see §1). The largest items are the JS bundle
  (Three.js + React, 323 kB gzip) and the fighter model (464 kB, uncompressed
  GLB — binary assets don't benefit from re-compression).
- Quality settings (high/medium/low) adapt resolution, shadows, and post-FX at
  runtime — no server involvement.
- Both platforms serve over HTTPS, which is also required for full
  WebGL/GameAudio behavior in some browsers.
- The `chunk size > 500 kB` warning during build is expected for a Three.js app
  and is safe to ignore (code-splitting improvements are on the M9 list).

---

## 6. Troubleshooting

| Symptom | Cause → Fix |
| --- | --- |
| Build fails at `tsc --noEmit` | Strict type errors. Run `npm run typecheck` locally and fix before pushing. |
| `sh: vite: not found` / `tsc: not found` | devDependencies were pruned — a `NODE_ENV=production` env var is set on the build. Remove it. |
| Blank page after deploy | Open browser devtools → Console. Usually an ad-blocker or corporate proxy stripping the GLB; verify `https://<host>/models/RobotExpressive.glb` returns 200. |
| Model/fonts 404 | `public/models` and `public/fonts` must be committed to Git (they are, unless excluded locally). Never gitignore `public/`. |
| Old version after deploy | Hashed assets under `/assets/` are cached for a year by design — but `index.html` itself is never cached, so a hard refresh (`Ctrl+Shift+R`) only is needed if a CDN edge lags. |
| Works locally, `npm ci` fails on platform | Lockfile out of sync with `package.json`. Run `npm install` locally, commit the updated `package-lock.json`. |
| Low FPS on the deployed URL | Client-side GPU matter — try the in-game SETTINGS → QUALITY → MEDIUM/LOW. |

---

## 7. Phase 7 preview — game server on Render *(future)*

When online multiplayer lands (see `PLAN.md` M7), the architecture is:

```
Browser (static client)          Render Web Service              Render PostgreSQL
  Vercel or Render static   ──►  Node + Express + Socket.IO  ──►  match history,
  WASM-free WebGL client          server-authoritative MatchEngine  accounts, ELO
                                  (same deterministic sim as client)
```

Key decisions already reflected in the codebase:

- **The simulation (`src/game/`) has zero rendering/DOM imports** so the identical
  `MatchEngine` can run inside the Socket.IO server — clients will send *inputs*,
  never damage or outcomes.
- **The game server goes on Render, not Vercel** — Socket.IO needs long-lived
  WebSocket connections, which Vercel's serverless functions don't support.
  Render web services hold WebSockets fine.
- The client will then gain one env var: `VITE_SERVER_URL` (set in Vercel/Render
  project settings → rebuilt automatically).

What `render.yaml` will grow into:

```yaml
# future sketch — not active yet
services:
  - type: web                      # existing static client (unchanged)
    name: arena-client
    runtime: static
    buildCommand: npm run build
    outputDir: dist
  - type: web                      # game server (Phase 7)
    name: arena-server
    runtime: node
    rootDir: server
    buildCommand: npm ci --prefix server
    startCommand: node server/index.js
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: arena-db
          property: connectionString
      - key: PORT
        value: 10000
databases:
  - name: arena-db
    plan: basic-256mb        # adjust to current Render Postgres plans
```

---

## 8. Platform cheat-sheet

| | Vercel | Render (Static Site) |
| --- | --- | --- |
| Deploy method | Git import / CLI | Git import / Blueprint (`render.yaml`) |
| Build command | `npm run build` | `npm run build` |
| Output | `dist` | `dist` |
| Node pinning | Settings → General (or `engines`) | `NODE_VERSION` env var |
| PR previews | Automatic | Available via blueprint/previews |
| WebSockets (Phase 7) | ❌ serverless limitation | ✅ use a Web Service |
| Custom domain + HTTPS | ✅ automatic | ✅ automatic |
| Config file in repo | `vercel.json` | `render.yaml` |
