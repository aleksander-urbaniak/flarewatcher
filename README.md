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

## Release Process

- On push to `main`, CI calculates the next patch tag from the latest `v*` tag
- First release is `v1.0.0`, then `v1.0.1`, `v1.0.2`, ...
- CI creates/pushes the git tag and creates a GitHub Release for that tag

## Docker Publish (GitHub Actions)

Workflow: `.github/workflows/docker-publish.yml`

Triggers:

- push to `main`

Published tags:

- `latest` on `main`
- exact semver tag from CI (example: `v1.0.0`)

Configure repository variables:

- `DOCKER_REGISTRY`
- `DOCKER_NAMESPACE`
- `DOCKER_IMAGE_NAME`

Default values when variables are not set:

- `DOCKER_REGISTRY=docker.io`
- `DOCKER_NAMESPACE=aleksanderurbaniak`
- `DOCKER_IMAGE_NAME=flarewatcher`

Configure repository secrets:

- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`

Target image path:

- `<REGISTRY>/<NAMESPACE>/<IMAGE_NAME>`

## Security

Container hardening:

- multi-stage Docker build
- production dependency pruning (`npm prune --omit=dev`)
- non-root runtime user
- OS package security updates in runtime layer
- package manager binaries removed from runtime image (`npm`, `npx`, `corepack`)

CI security gates:

- `npm audit` for production dependencies; build fails on fixable HIGH/CRITICAL issues
- Trivy image scan with `HIGH,CRITICAL`, `ignore-unfixed=true`

## Environment Variables

```bash
DATABASE_URL=file:./prisma/flarewatcher.db
SECRET_ENCRYPTION_KEY=replace-with-a-long-random-secret
```

## License

MIT. See `LICENSE`.
