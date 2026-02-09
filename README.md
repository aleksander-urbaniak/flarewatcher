# Flarewatcher

Flarewatcher is a self-hosted Cloudflare DDNS and DNS operations dashboard.

<img src="https://img.shields.io/badge/Next.js-16.1.6-000000?logo=nextdotjs" alt="Next.js" />
<img src="https://img.shields.io/badge/Prisma-6.19.2-2D3748?logo=prisma" alt="Prisma" />
<img src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker Ready" />
<img src="https://img.shields.io/badge/License-MIT-green" alt="License MIT" />

## Features

- Cloudflare zone and record management in one UI
- Public IP detection and DNS update workflows
- Record auto-update and bulk actions
- Audit log + user activity tracking
- DNS rollback from update history
- Alerting via Discord webhook and SMTP
- Session auth with optional 2FA
- Security hardening (origin checks, rate limiting, secure cookies, encrypted secrets)

## Quick Start (Docker Pull)

1. Copy environment file:

```bash
cp .env.example .env
```

2. Set required values in `.env`:

- `SECRET_ENCRYPTION_KEY=<strong-random-value>`

3. Start:

```bash
docker compose pull
docker compose up -d
```

Flarewatcher runs on `http://localhost:3000`.

## Local Development (Non-Docker)

Requirements:

- Node.js 20+
- npm

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:db
npm run dev
```

## Versioning Model

- Release source of truth: **Git tags**
- Tag format: `vMAJOR.MINOR.PATCH` (example: `v1.0.0`)
- Initial baseline release: `v1.0.0`
- Runtime version source:
  - release images: CI-generated GitHub tag (example: `v1.0.0`)
  - local/non-CI fallback: `package.json` version

Useful scripts:

- `npm run version:resolve` -> prints `MAJOR.MINOR.PATCH`
- `npm run version:resolve:tag` -> prints `vMAJOR.MINOR.PATCH`

## Environment Variables

```bash
# local dev
DATABASE_URL=file:./prisma/flarewatcher.db

# Docker / Kubernetes
# DATABASE_URL=file:/app/data/flarewatcher.db

SECRET_ENCRYPTION_KEY=replace-with-a-long-random-secret
```

## License

MIT. See `LICENSE`.
