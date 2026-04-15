# Binance Funding Rate Tracker

Production-ready Next.js 14 (App Router) + PostgreSQL + Prisma app for tracking Binance Futures funding rates.

## Setup

```bash
npm install
cp .env.example .env        # set DATABASE_URL
npx prisma migrate dev --name init
npm run dev
```

Open http://localhost:3000.

## Cron — pick one

**Local / VPS (node-cron):** in a separate terminal run:

```bash
npm run cron
```

**Vercel:** `vercel.json` already declares a `* * * * *` cron hitting `/api/cron`.
Set `CRON_SECRET` in env and Vercel Cron will send `Authorization: Bearer <secret>`
automatically (configure via Vercel dashboard) — or remove the secret check.

**External (cron-job.org, GitHub Actions):** GET `/api/cron` every minute with
`Authorization: Bearer $CRON_SECRET`.

## Structure

- `app/page.tsx` — landing page (Server Component, reads from DB)
- `app/api/symbols/route.ts` — POST/GET symbols (Zod-validated)
- `app/api/symbols/[id]/route.ts` — DELETE symbol
- `app/api/cron/route.ts` — serverless cron endpoint
- `lib/prisma.ts` — Prisma singleton
- `lib/binance.ts` — Binance Futures client (timeout + retry)
- `lib/updateFunding.ts` — batch update via Promise.allSettled
- `lib/cron.ts` — node-cron worker (long-running)
- `components/SymbolForm.tsx` — add-symbol form
- `components/SymbolTable.tsx` — live table with countdown, polling, delete

## Notes

- Funding interval is assumed 8h per Binance default.
- Rates color-coded: green positive / red negative.
- Countdown updates client-side every second; data polled every 30s.
- New symbols are validated against Binance before insert.
