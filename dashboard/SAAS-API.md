# RapidX Voice SaaS API

All endpoints use the existing `rxv_sess` HttpOnly cookie. Every customer resource is scoped from the authenticated session tenant. IDs in request bodies never select tenant scope. Money is represented as integer paise and wallets use INR.

## Roles

`super_admin` can operate every platform account. `admin` can operate billing and support across accounts. `owner` manages one tenant. `member` uses tenant resources. Suspended users and tenants cannot create sessions or use authenticated routes.

## Auth and trial

- `POST /api/auth/signup` with `{email,password,name,company}` returns `{user,tenant}` and creates one immutable `trial_grant` ledger entry for 1,000 paise, ₹10.
- `POST /api/auth/login` returns `{user,tenant}`.
- `POST /api/auth/logout` returns `{ok:true}`.
- Test-user bootstrap is disabled unless `TEST_USER_EMAIL` and a `TEST_USER_PASSWORD` of at least 12 characters are set. `TEST_USER_SUPER_ADMIN=true` grants that bootstrap user platform scope.

## Tenant APIs

- `GET /api/me` returns `{user,tenant}`.
- `GET /api/wallet` returns `{wallet,ledger}`. Wallet includes `balancePaise` and display-only `balanceInr`.
- `GET /api/payment-intents` returns `{paymentIntents}`.
- `POST /api/payment-intents` with `{packId,firstname,phone}` accepts server-owned packs `starter`, `growth`, or `scale`. It returns `{paymentIntent,checkoutReady,checkout,message}`. When PayU and a public HTTPS origin are configured, `checkout` contains the hosted-checkout URL and signed fields. Secrets and the intent token are never returned.
- `POST /api/payu/callback` is a public form-urlencoded PayU success callback. It checks the reverse hash and persisted checkout snapshot, calls PayU `verify_payment`, then applies exactly one immutable `payment_credit` ledger entry.
- `POST /api/payu/return` is a public form-urlencoded failure/browser return and always returns pending verification. It never credits the wallet.
- `GET /api/presets` returns the system presets and tenant-owned presets.
- `POST /api/agents` accepts the existing body plus optional `presetId`. Preset name, persona, and greeting are defaults and explicit request values win.
- `GET /api/privacy` returns `{mode}`.
- `POST /api/privacy` with `{mode}` accepts `standard`, `metadata_only`, or `no_recording`. Owner required.
- `GET /api/byon` returns `{connections}` without credentials.
- `POST /api/byon` with `{provider,address,label}` creates a pending connection. Owner required. Supported values are `vobiz`, `twilio`, `telnyx`, `plivo`, `vonage`, and `sip`.
- `GET /api/members` returns `{users}`. Owner required.
- `POST /api/members/role` with `{userId,role}` accepts `owner` or `member`. Owner required.
- `GET /api/audit` returns the latest 200 tenant audit events. Owner required.
- `GET /api/support/tickets` returns `{tickets}` with tenant messages.
- `POST /api/support/tickets` with `{subject,message,priority}` returns `{ticket}`.
- `POST /api/support/tickets/reply` with `{ticketId,message}` returns `{message}`.
- `POST /api/voice/session` creates a short-lived Dograh SmallWebRTC session for the authenticated tenant. The long-lived embed token remains server-side.
- `GET /api/hvac/desk` returns the tenant's HVAC jobs, summary counters, timezone, and calendar status.
- `GET /api/hvac/event-types` and `GET /api/hvac/slots` proxy authenticated Cal.com availability without exposing the API key.
- `POST /api/hvac/jobs` creates or updates a tenant-scoped call outcome.
- `POST /api/hvac/book` creates a Cal.com booking and records the booked outcome for the tenant.

## Platform admin APIs

- `GET /api/admin/overview` returns `{totals:{tenants,users,openTickets,walletPaise,calls}}`. Super admin required.
- `GET /api/admin/tenants` returns `{tenants}` with user count and wallet. Super admin required.
- `GET /api/admin/users` returns `{users}`. Super admin required.
- `GET /api/admin/audit` returns the latest 500 platform audit events. Admin required.
- `GET /api/admin/tickets` returns `{tickets}`. Admin required.
- `POST /api/admin/tenants/status` with `{tenantId,status}` accepts `active`, `suspended`, or `closed`. Super admin required and revokes sessions when inactive.
- `POST /api/admin/users/status` with `{userId,status}` accepts `active`, `suspended`, or `deleted`. Super admin required and revokes sessions.
- `POST /api/admin/users/role` with `{userId,role}` accepts `super_admin`, `admin`, `owner`, or `member`. Super admin required and self-demotion is rejected.
- `POST /api/admin/wallet/adjust` with `{tenantId,amountPaise,idempotencyKey,reason}` returns `{ledgerEntry}`. Replays return `{duplicate:true}` and never apply twice. Admin required.
- `POST /api/admin/tickets/reply` with `{ticketId,message,internal,status}` returns `{message}`. Admin required.

## Persistence collections

Schema version 2 adds `wallets`, `ledger`, `paymentIntents`, `supportTickets`, `supportMessages`, `auditEvents`, `presets`, `byonConnections`, `hvacJobs`, `hvacSettings`, and `paymentEvents`. Startup migration is additive. Existing agents, usage, tenants, users, and sessions remain valid. New session tokens are stored as SHA-256 hashes; legacy sessions continue to resolve during migration.

The JSON store remains suitable for a single-process demo. Production must move these contracts to transactional PostgreSQL before accepting money. PayU success redirects must never credit a wallet. Only a verified, idempotent server callback may convert a payment intent into a ledger credit.

## BYON and number marketplace integration decision

The current `/api/byon` collection is an onboarding placeholder, not the source of truth for telephony credentials or number ownership. The production implementation will bind every SaaS tenant to its own Dograh organization and scoped API key, then proxy Dograh's organization-scoped telephony configuration and phone-number APIs. A browser request may never choose a Dograh organization or submit an API key. The existing global Dograh key remains demo-only and must not serve multiple paying tenants.

Harddiikk/voice-engine at commit `bc374cd26949ebf51b7be0d16150df7114933522` is a design reference for optional VoiceLink KYC and number procurement. Reuse is limited to its KYC HTTP adapter contract, fail-closed purchase gate, server-side DID availability recheck, atomic debit and refund ordering, and reconciliation behavior. Do not deploy or merge the fork over the Dograh v1.43 call plane. It is based on v1.39, has an incompatible migration graph, and its marketplace provisions VoiceLink numbers rather than the verified VoBiz path. BSD-2-Clause attribution must be retained for adapted code.

BYON carrier onboarding remains the identity and KYC source of truth. Number ownership verification is separate from identity verification. New connections stay pending until ownership, use-case attestation, and any required manual review are complete. Sensitive provider credentials must move to encrypted storage or secret references before shared production.
