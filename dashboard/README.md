<div align="center">
  <img src="public/assets/logo.svg" alt="RapidX Voice" width="300" />
</div>

# RapidX Voice

**Production AI voice agents at roughly one rupee.** A premium, multi-tenant, provider-agnostic voice agent platform. Powered by Rumik silk TTS, about 20x cheaper than ElevenLabs, with a swappable engine so you are never locked into one TTS, LLM, or telephony vendor.

It runs in **one folder, with zero dependencies**. No build step, no bundler, no framework, no CDN. Copy the folder to any machine with Node 18 or newer and it just runs, fully offline for everything except the upstream provider calls.

## Quick start (3 commands)

```sh
cp .env.example .env     # then fill in your keys (see below)
sh setup.sh              # checks Node, creates data/, prints next steps
node server.js           # serves the site and API on http://localhost:8787
```

No `npm install` is needed, there are no npm dependencies. Open `http://localhost:8787` and log in.

### Demo login

A demo tenant is seeded on first boot so you can click around immediately:

```
email:    demo@rapidx.ai
password: rapidxvoice
```

## What "provider agnostic" means

The product is built in three swappable layers. Each layer is a registry of adapters behind one uniform interface, so you change a provider by adding an env key, not by rewriting code.

| Layer | Live today | Ready to wire (add the env key) |
| --- | --- | --- |
| **Voice (TTS)** | Rumik silk | ElevenLabs, Sarvam |
| **Brain (LLM)** | Google Gemini | Claude |
| **Telephony** | VoiceLink | Zoom, Twilio |

The Settings screen reads `GET /api/providers` and shows which provider is active and which is ready to wire, with the exact env keys each one needs. Drop the key in `.env`, restart, and it goes live. We only support Gemini and Claude on the brain layer, never OpenAI.

## The economics

The whole pitch is the price. Rumik silk bills per character at promo rates that land a normal agent reply near **one rupee**, against roughly **twenty rupees** for the same on ElevenLabs. Usage is metered per tenant per day (characters, calls, LLM tokens) and surfaced as an INR cost in the dashboard, so the savings are visible, not a marketing claim.

## What you can do in the console

- **Overview** with live provider health, usage, and quick actions.
- **Agents**: build an agent (persona, voice model, speaker, pitch, greeting, assigned phone number) and preview its real voice in one click.
- **Voice Studio**: type text, pick a model and voice, synthesize a real WAV, see the character count and cost.
- **Talk to it**: a live loop, your voice to text to the Gemini brain to a spoken Rumik reply.
- **Telephony**: live VoiceLink wallet, DIDs, and engine health, plus a guarded outbound dial.
- **Settings**: the provider registry, tenant branding, and logout.

## Security notes

- All provider keys live in `.env`, which is gitignored. **Keys never reach the browser.** The server is the only thing that talks to Rumik, Gemini, and VoiceLink.
- Passwords are hashed with `crypto.scryptSync` and a per-user random salt. Never stored in plaintext.
- Sessions are opaque random tokens in an httpOnly cookie, with a 7 day expiry.
- Strict tenant isolation: every read and write is scoped to the session's tenant. A cross-tenant access returns 403.
- Any user-supplied string (name, email, persona) is escaped before it is rendered into the DOM.
- Outbound phone calls are guarded. A real, paid call only goes out with an explicit confirm, never automatically.

## Deploy

Runs anywhere Node runs. The natural home is the Hostinger VPS so the secret keys stay server-side and close to users. Do not host the keys on a static site. Never run the realtime server under a file watcher, watchers fire restarts as the OS touches files and drop live sockets.

Built for RapidX AI. No em dashes anywhere in this codebase.
