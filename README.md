# KnowYourMechanic

Garage service records customers can trust. A garage logs a service against the
customer's phone number, the customer confirms it with an OTP, the garage
collects payment on its own UPI QR, and the verified record lands in both the
garage's dashboard and the customer's vehicle history.

## Stack

- **App:** React 19 + Vite + Tailwind v4, shipped to Android/iOS with Capacitor 6.
- **Backend:** Supabase — Postgres (RLS + `SECURITY DEFINER` RPCs for every
  state change), Auth (phone OTP via the `msg91-sms` hook), Storage, and Edge
  Functions in `supabase/functions`.

## Develop

```bash
npm ci
npm run dev          # http://localhost:5183
npm run typecheck    # also runs as a pre-push hook
npm run lint
npm run build
```

Mobile: `npm run build && npx cap sync`, then open `android/` or `ios/`.

## Backend

- Migrations: `supabase/migrations` (apply in order with `supabase db push`).
- Edge functions: `supabase functions deploy <name>`; secrets are listed in
  `.env.example`. `msg91-sms` and `razorpay-webhook` run with
  `verify_jwt = false` (see `supabase/config.toml`).
- Write paths are documented in `supabase/SERVICE_WRITE_PATH.md`.

## Roles

`customer`, `garage` (self-service — one number can hold both), and
`admin`, `employee`, `support` (granted by an admin only).
