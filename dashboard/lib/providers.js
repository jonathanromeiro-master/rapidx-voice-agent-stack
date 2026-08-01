/**
 * RapidX Voice. Provider-agnostic engine. ZERO npm dependencies.
 *
 * Three registries, each a uniform set of adapters:
 *   tts        : rumik (LIVE) + elevenlabs, sarvam (stubs)
 *   llm        : gemini (LIVE) + claude (stub)   NEVER OpenAI/GPT
 *   telephony  : voicelink (LIVE) + zoom, twilio (stubs)
 *
 * Every adapter declares { id, label, live, needs:[envKeys], ... }. The `live`
 * flag is DERIVED from whether all required env keys are present at call time,
 * so the same code path lights up the moment a tenant adds the keys. Stubs
 * return a clear "not configured, add <ENV>" error instead of pretending.
 *
 * The LIVE adapters reuse the verified calls from _legacy/server.legacy.js
 * EXACTLY (Rumik browser UA never removed, Gemini thinkingBudget 0, VoiceLink
 * national number + country_code 91, token cached 30 min). Do not reinvent them.
 *
 * No em dashes anywhere. Commas and periods only.
 */
'use strict';

const { httpsPost, httpsGet } = require('./core');

// Rumik sits behind Cloudflare, which 403s non-browser user-agents. NEVER remove.
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

const RUMIK_HOST = 'silk-api.rumik.ai';
const GEMINI_HOST = 'generativelanguage.googleapis.com';
const MAX_TEXT = 2000; // Rumik hard cap

const TTS_MODELS = new Set(['muga', 'mulberry']);
const TTS_SPEAKERS = new Set(['speaker_1', 'speaker_2', 'speaker_3', 'speaker_4']);

// A capability error that route handlers can map to an HTTP status cleanly.
class ProviderError extends Error {
  constructor(message, status = 502, code = 'provider_error', detail) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

// True when EVERY env key in `keys` is present and non-empty.
function hasEnv(keys) {
  return keys.every((k) => !!(process.env[k] && String(process.env[k]).trim()));
}

// Build the standard "this adapter is a stub" error.
function notConfigured(label, needs) {
  return new ProviderError(
    `${label} is not configured. Add ${needs.join(', ')} to .env to enable it.`,
    501,
    'not_configured',
    { needs },
  );
}

/* ==========================================================================
   TTS LAYER
   ========================================================================== */

const ttsRumik = {
  id: 'rumik',
  label: 'Rumik Silk',
  layer: 'tts',
  needs: ['RUMIK_API_KEY'],
  get live() { return hasEnv(this.needs); },

  // Synthesize one utterance. Returns { buffer (WAV bytes), credits, chars }.
  // Reuses the verified /v1/tts call exactly: Bearer key + browser UA, mulberry
  // takes speaker/f0_up_key/description, both models take optional sampling args.
  async synthesize(opts) {
    const key = process.env.RUMIK_API_KEY;
    if (!key) throw notConfigured(this.label, this.needs);

    const model = TTS_MODELS.has(opts.model) ? opts.model : 'muga';
    const text = String(opts.text || '').slice(0, MAX_TEXT);
    if (!text.trim()) throw new ProviderError('text is required', 422, 'no_text');

    const payload = { model, text };
    if (model === 'mulberry') {
      if (opts.description) payload.description = String(opts.description).slice(0, 500);
      if (opts.speaker && TTS_SPEAKERS.has(opts.speaker)) payload.speaker = opts.speaker;
      if (Number.isFinite(opts.f0_up_key)) {
        payload.f0_up_key = Math.max(-12, Math.min(12, opts.f0_up_key | 0));
      }
    }
    for (const k of ['temperature', 'top_p', 'top_k', 'repetition_penalty', 'max_new_tokens']) {
      if (Number.isFinite(opts[k])) payload[k] = opts[k];
    }

    const buf = Buffer.from(JSON.stringify(payload));
    const up = await httpsPost(RUMIK_HOST, '/v1/tts', {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Content-Length': buf.length,
      'User-Agent': BROWSER_UA,
    }, buf);

    if (up.status !== 200) {
      throw new ProviderError('rumik synthesis failed', up.status, 'upstream',
        up.buffer.toString('utf8').slice(0, 300));
    }
    return {
      buffer: up.buffer,
      credits: up.headers['x-credits-used'] || '',
      chars: text.length,
    };
  },

  // Mint a one-shot streaming session. Returns { ws_url, token } from Rumik.
  async wsConnect(opts) {
    const key = process.env.RUMIK_API_KEY;
    if (!key) throw notConfigured(this.label, this.needs);
    const model = TTS_MODELS.has(opts.model) ? opts.model : 'mulberry';
    const buf = Buffer.from(JSON.stringify({
      model,
      text: String(opts.text || '').slice(0, MAX_TEXT),
    }));
    const up = await httpsPost(RUMIK_HOST, '/v1/tts/ws-connect', {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Content-Length': buf.length,
      'User-Agent': BROWSER_UA,
    }, buf);
    if (up.status !== 200) {
      throw new ProviderError('rumik mint failed', up.status, 'upstream',
        up.buffer.toString('utf8').slice(0, 300));
    }
    let data;
    try { data = JSON.parse(up.buffer.toString('utf8')); } catch { data = {}; }
    return data; // { ws_url, token }
  },
};

const ttsElevenlabs = {
  id: 'elevenlabs',
  label: 'ElevenLabs',
  layer: 'tts',
  needs: ['ELEVENLABS_API_KEY'],
  get live() { return hasEnv(this.needs); },
  async synthesize() { throw notConfigured(this.label, this.needs); },
  async wsConnect() { throw notConfigured(this.label, this.needs); },
};

const ttsSarvam = {
  id: 'sarvam',
  label: 'Sarvam AI',
  layer: 'tts',
  needs: ['SARVAM_API_KEY'],
  get live() { return hasEnv(this.needs); },
  async synthesize() { throw notConfigured(this.label, this.needs); },
  async wsConnect() { throw notConfigured(this.label, this.needs); },
};

/* ==========================================================================
   LLM LAYER (brain + STT). Gemini LIVE, Claude stub. NEVER OpenAI.
   ========================================================================== */

const DEFAULT_SYSTEM = 'You are RapidX, a warm, concise voice assistant. Reply in 1 to 3 short spoken sentences. No markdown, no lists, no emojis. This will be read aloud.';

const llmGemini = {
  id: 'gemini',
  label: 'Google Gemini',
  layer: 'llm',
  needs: ['GEMINI_API_KEY'],
  get live() { return hasEnv(this.needs); },
  get model() { return process.env.GEMINI_MODEL || 'gemini-flash-latest'; },

  // The conversation brain. Reuses the verified generateContent call with
  // thinkingConfig.thinkingBudget 0 for low voice-loop latency.
  // Returns { text, finish }.
  async chat(opts) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw notConfigured(this.label, this.needs);

    const history = Array.isArray(opts.messages) ? opts.messages.slice(-16) : [];
    const system = String(opts.system || DEFAULT_SYSTEM).slice(0, 2000);
    const contents = history
      .filter((m) => m && m.text)
      .map((m) => ({
        role: (m.role === 'assistant' || m.role === 'model') ? 'model' : 'user',
        parts: [{ text: String(m.text).slice(0, 4000) }],
      }));
    if (!contents.length) throw new ProviderError('no messages', 422, 'no_messages');

    const payload = {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        maxOutputTokens: 400,
        temperature: 0.8,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };
    const buf = Buffer.from(JSON.stringify(payload));
    const up = await httpsPost(GEMINI_HOST,
      `/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${key}`,
      { 'Content-Type': 'application/json', 'Content-Length': buf.length }, buf);

    let data; try { data = JSON.parse(up.buffer.toString('utf8')); } catch { data = {}; }
    if (up.status !== 200) {
      throw new ProviderError('gemini error', up.status, 'upstream',
        (data.error && data.error.message) || '');
    }
    const cand = (data.candidates || [])[0] || {};
    const parts = (cand.content && cand.content.parts) || [];
    const text = parts.map((p) => p.text || '').join('').trim();
    return { text: text || 'Sorry, I did not catch that.', finish: cand.finishReason || null };
  },

  // Speech to text via Gemini inline_data. Works in any browser. Returns { text }.
  async transcribe(opts) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw notConfigured(this.label, this.needs);
    const audio = String(opts.audio || '');
    const mime = String(opts.mime || 'audio/wav');
    if (audio.length < 200) throw new ProviderError('no audio', 422, 'no_audio');

    const payload = {
      contents: [{
        role: 'user',
        parts: [
          { inline_data: { mime_type: mime, data: audio } },
          { text: 'Transcribe the spoken words exactly. Return only the transcript text, nothing else. If there is no clear speech, return an empty string.' },
        ],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 300, thinkingConfig: { thinkingBudget: 0 } },
    };
    const buf = Buffer.from(JSON.stringify(payload));
    const up = await httpsPost(GEMINI_HOST,
      `/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${key}`,
      { 'Content-Type': 'application/json', 'Content-Length': buf.length }, buf);

    let d = {}; try { d = JSON.parse(up.buffer.toString('utf8')); } catch {}
    if (up.status !== 200) {
      throw new ProviderError('stt failed', up.status, 'upstream',
        (d.error && d.error.message) || '');
    }
    const cand = (d.candidates || [])[0] || {};
    const text = ((cand.content && cand.content.parts) || []).map((p) => p.text || '').join('').trim();
    return { text };
  },
};

const llmClaude = {
  id: 'claude',
  label: 'Anthropic Claude',
  layer: 'llm',
  needs: ['ANTHROPIC_API_KEY'],
  get live() { return hasEnv(this.needs); },
  async chat() { throw notConfigured(this.label, this.needs); },
  async transcribe() { throw notConfigured(this.label, this.needs); },
};

/* ==========================================================================
   TELEPHONY LAYER. VoiceLink LIVE, Zoom + Twilio stubs.
   ========================================================================== */

const VL_BASE = process.env.VOICELINK_BASE || 'app.voicelink.co.in';
const VL_DID = process.env.VOICELINK_DID || '919484956633';
const ENGINE_TUNNEL = process.env.ENGINE_TUNNEL || '';

// Token cache, 30 min, reused across requests (verified behavior).
let _vlToken = { value: '', exp: 0 };

// Probe an https host root for reachability. Used for engine tunnel health.
function tunnelHealth(host) {
  return new Promise((resolve) => {
    if (!host) return resolve('not set');
    const https = require('https');
    const rq = https.request({ host, path: '/', method: 'GET', timeout: 8000 }, (rp) => {
      resolve('reachable (' + rp.statusCode + ')');
      rp.destroy();
    });
    rq.on('error', () => resolve('unreachable'));
    rq.on('timeout', () => { rq.destroy(); resolve('unreachable'); });
    rq.end();
  });
}

const telVoicelink = {
  id: 'voicelink',
  label: 'VoiceLink',
  layer: 'telephony',
  needs: ['VOICELINK_RESELLER_USER', 'VOICELINK_RESELLER_PASS'],
  get live() { return hasEnv(this.needs); },
  get did() { return VL_DID; },
  get dashboard() { return `https://${VL_BASE}/call-logs`; },

  // Login, cache the access_token 30 min. Reuses the verified auth call.
  async login() {
    if (_vlToken.value && Date.now() < _vlToken.exp) return _vlToken.value;
    if (!hasEnv(this.needs)) throw notConfigured(this.label, this.needs);
    const buf = Buffer.from(JSON.stringify({
      username: process.env.VOICELINK_RESELLER_USER,
      password: process.env.VOICELINK_RESELLER_PASS,
    }));
    const up = await httpsPost(VL_BASE, '/api/v1/auth/login', {
      'Content-Type': 'application/json',
      'Content-Length': buf.length,
      'User-Agent': BROWSER_UA,
    }, buf);
    let d = {}; try { d = JSON.parse(up.buffer.toString('utf8')); } catch {}
    const tok = d && d.data && d.data.access_token;
    if (!tok) throw new ProviderError('voicelink login failed', 502, 'upstream',
      up.buffer.toString('utf8').slice(0, 200));
    _vlToken = { value: tok, exp: Date.now() + 30 * 60 * 1000 };
    return tok;
  },

  // Live status: routing list + reseller clients (wallet + dids) + engine probe.
  // Reuses the verified call-routing/list and reseller/clients reads.
  async status() {
    if (!hasEnv(this.needs)) throw notConfigured(this.label, this.needs);
    const tok = await this.login();
    const auth = { 'Authorization': `Bearer ${tok}`, 'User-Agent': BROWSER_UA };
    const [cr, cl] = await Promise.all([
      httpsGet(VL_BASE, '/api/v1/call-routing/list', auth),
      httpsGet(VL_BASE, '/api/v1/reseller/clients', auth),
    ]);
    let routing = []; let wallet = null; let dids = [];
    try { routing = (JSON.parse(cr.buffer.toString('utf8')).data) || []; } catch {}
    try {
      const c = (JSON.parse(cl.buffer.toString('utf8')).data || [])[0] || {};
      wallet = c.wallet;
      dids = c.dids || [];
    } catch {}
    const engine = await tunnelHealth(ENGINE_TUNNEL);
    return { routing, wallet, dids, engine, did: VL_DID, dashboard: this.dashboard };
  },

  // Place a REAL paid call via add_lead. The route layer enforces confirm:true.
  // Number is normalized to a 10-digit national number. country_code is '91'
  // (NOT a full E.164), which is the verified contract that avoids cause 38.
  async dial(rawNumber) {
    if (!hasEnv(this.needs)) throw notConfigured(this.label, this.needs);
    let num = String(rawNumber || '').replace(/[^0-9]/g, '');
    if (num.length === 12 && num.startsWith('91')) num = num.slice(2);
    if (num.length !== 10) {
      throw new ProviderError('need a 10-digit Indian mobile (national format)', 422, 'bad_number');
    }
    const tok = await this.login();
    const buf = Buffer.from(JSON.stringify({
      did_number: VL_DID,
      customer_number: num,
      country_code: '91',
    }));
    const up = await httpsPost(VL_BASE, '/api/v1/add_lead', {
      'Authorization': `Bearer ${tok}`,
      'Content-Type': 'application/json',
      'Content-Length': buf.length,
      'User-Agent': BROWSER_UA,
    }, buf);
    let d = {}; try { d = JSON.parse(up.buffer.toString('utf8') || '{}'); } catch {}
    return { status: up.status, data: d };
  },
};

const telZoom = {
  id: 'zoom',
  label: 'Zoom Phone',
  layer: 'telephony',
  needs: ['ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET'],
  get live() { return hasEnv(this.needs); },
  async status() { throw notConfigured(this.label, this.needs); },
  async dial() { throw notConfigured(this.label, this.needs); },
};

const telTwilio = {
  id: 'twilio',
  label: 'Twilio Voice',
  layer: 'telephony',
  needs: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
  get live() { return hasEnv(this.needs); },
  async status() { throw notConfigured(this.label, this.needs); },
  async dial() { throw notConfigured(this.label, this.needs); },
};

/* ==========================================================================
   Registries + lookups + describeProviders for GET /api/providers
   ========================================================================== */

const registries = {
  tts: { rumik: ttsRumik, elevenlabs: ttsElevenlabs, sarvam: ttsSarvam },
  llm: { gemini: llmGemini, claude: llmClaude },
  telephony: { voicelink: telVoicelink, zoom: telZoom, twilio: telTwilio },
};

// Resolve an adapter for a layer, falling back to that layer's live default.
function get(layer, id) {
  const reg = registries[layer] || {};
  if (id && reg[id]) return reg[id];
  // default: the first live adapter, else the first declared.
  const all = Object.values(reg);
  return all.find((a) => a.live) || all[0] || null;
}

// Convenience accessors for the live defaults.
const tts = ttsRumik;
const llm = llmGemini;
const telephony = telVoicelink;

// Shape used by GET /api/providers so the UI can render active vs ready-to-wire.
function describeProviders() {
  const out = {};
  for (const [layer, reg] of Object.entries(registries)) {
    out[layer] = Object.values(reg).map((a) => ({
      id: a.id,
      label: a.label,
      live: a.live,
      needs: a.needs,
    }));
  }
  return out;
}

module.exports = {
  ProviderError,
  registries, get, describeProviders,
  tts, llm, telephony,
  MAX_TEXT, TTS_MODELS, TTS_SPEAKERS,
  BROWSER_UA,
};
