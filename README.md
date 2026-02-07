# Flarewatcher

Flarewatcher is an easy-to-use self-hosted Cloudflare DDNS and DNS operations dashboard.

<img src="https://img.shields.io/badge/Next.js-16.1.6-000000?logo=nextdotjs" alt="Next.js" />
<img src="https://img.shields.io/badge/Prisma-6.19.2-2D3748?logo=prisma" alt="Prisma" />
<img src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker Ready" />
<img src="https://img.shields.io/badge/License-MIT-green" alt="License MIT" />

## Live Demo

There is no public demo instance by default.

If you want a demo, deploy with Docker Compose locally and expose it behind a reverse proxy.

## Features

- Cloudflare zone and record management in one UI
- Public IP detection and DNS update workflows
- Record auto-update and bulk actions
- Audit log + user activity tracking with detail modals
- IP change timeline (real event history)
- Alerting via Discord webhook and SMTP
- Local notifications, command palette, and theme support
- Session-based auth with optional 2FA
- API and app hardening (origin checks, rate-limiting, secure cookies)
- Secret encryption at rest for Cloudflare tokens and SMTP password

## How to Install

### Docker Compose

```bash
git clone <your-repo-url>
cd flarewatcher
cp .env.example .env
# set SECRET_ENCRYPTION_KEY in .env
docker compose up --build -d
```

Flarewatcher will run on `http://localhost:3000`.

> [!WARNING]
> In production, set a strong `SECRET_ENCRYPTION_KEY`. Do not leave the example value.

### Docker Command

```bash
docker build -t flarewatcher .
docker run -d \
  --name flarewatcher \
  --restart unless-stopped \
  -p 3000:3000 \
  -e DATABASE_URL=file:/app/data/flarewatcher.db \
  -e SECRET_ENCRYPTION_KEY=<strong-random-value> \
  -v flarewatcher-data:/app/data \
  flarewatcher
```

### Non-Docker

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

Open `http://localhost:3000`.

## Environment Variables

```bash
DATABASE_URL=file:./prisma/flarewatcher.db
SECRET_ENCRYPTION_KEY=replace-with-a-long-random-secret
```

Notes:

- `SECRET_ENCRYPTION_KEY` is required in production.
- Existing plaintext secrets are migrated to encrypted form automatically during runtime reads.

## Production

Non-container:

```bash
npm run build
npm run prisma:migrate
npm run start
```

Container:

- The Docker image uses `npm run start:prod` which runs migration deploy and starts the app.
- For pre-migration databases, baseline resolution is handled automatically once.

## How to Update

```bash
git pull
npm install
npm run build
npm run prisma:migrate
npm run start
```

If using Docker:

```bash
docker compose build --no-cache
docker compose up -d
```

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build production bundle
- `npm run start` - Start server (no migration step)
- `npm run start:prod` - Run migrations + start server
- `npm run lint` - Lint project
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:db` - Apply schema using `db push` (dev convenience)
- `npm run prisma:migrate` - Apply migrations (`migrate deploy`)

## Security Notes

- Use HTTPS in front of the app (reverse proxy)
- Keep `.env` out of version control
- Rotate `SECRET_ENCRYPTION_KEY` carefully and back up DB volume
- Restrict external exposure of port `3000` when possible

## Contributions

Pull requests and issues are welcome.

Recommended:

- Keep PRs focused and small
- Include repro steps for bug reports
- Run `npm run lint` and `npm run build` before submitting

## License

This project is licensed under the MIT License. See `LICENSE`.
