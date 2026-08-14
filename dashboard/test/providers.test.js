'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const providersPath = require.resolve('../lib/providers');
const corePath = require.resolve('../lib/core');
const originalEnv = { ...process.env };

function resetEnv(values = {}) {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv, values);
  for (const key of ['LLM_PROVIDER', 'LLM_MODEL', 'TTS_PROVIDER', 'TTS_MODEL', 'STT_PROVIDER',
    'GROQ_ALLOWED_MODELS', 'GEMINI_ALLOWED_MODELS']) {
    if (!(key in values)) delete process.env[key];
  }
}

function loadProviders(overrides = {}) {
  delete require.cache[providersPath];
  delete require.cache[corePath];
  const core = require(corePath);
  if (overrides.httpsPost) core.httpsPost = overrides.httpsPost;
  if (overrides.requestUrl) core.requestUrl = overrides.requestUrl;
  require.cache[corePath].exports = core;
  return require(providersPath);
}

test.afterEach(() => {
  resetEnv();
  delete require.cache[providersPath];
  delete require.cache[corePath];
});

test('registry advertises implemented providers for local speech and BR DID migration', () => {
  resetEnv();
  const providers = loadProviders();
  const described = providers.describeProviders();
  assert.deepEqual(described.stt.map((row) => row.id), ['deepgram', 'local_whisper']);
  assert.deepEqual(described.tts.map((row) => row.id), ['rumik', 'local_piper']);
  assert.deepEqual(
    described.tts.map((row) => ({ id: row.id, selected: row.selected, model: row.model, streaming: row.streaming })),
    [
      { id: 'rumik', selected: false, model: 'mulberry', streaming: true },
      { id: 'local_piper', selected: true, model: 'piper', streaming: false },
    ],
  );
  assert.deepEqual(described.llm.map((row) => row.id), ['groq', 'gemini']);
  assert.deepEqual(described.telephony.map((row) => row.id), ['brdid_asterisk', 'telnyx', 'vobiz']);
  assert.equal(JSON.stringify(described).includes('API_KEY_VALUE'), false);
  assert.ok(Object.values(described).flat().every((row) => row.implemented === true));
});

test('environment selects an implemented LLM and model without tenant secrets', () => {
  resetEnv({ LLM_PROVIDER: 'gemini', LLM_MODEL: 'gemini-2.5-flash', GEMINI_API_KEY: 'server-only' });
  const providers = loadProviders();
  assert.equal(providers.llm.id, 'gemini');
  const choice = providers.resolveSelection('llm', { provider: 'gemini', model: 'gemini-2.5-flash' });
  assert.equal(choice.provider, 'gemini');
  assert.equal(choice.model, 'gemini-2.5-flash');
  assert.equal(choice.adapter.live, true);
  assert.throws(
    () => providers.resolveSelection('llm', { provider: 'gemini', apiKey: 'tenant-secret' }),
    (error) => error.code === 'unsafe_provider_selection',
  );
});

test('unknown providers and malformed model identifiers fail closed', () => {
  resetEnv();
  const providers = loadProviders();
  assert.throws(() => providers.get('llm', 'made-up'), (error) => error.code === 'unsupported_provider');
  assert.throws(
    () => providers.resolveSelection('llm', { provider: 'groq', model: '../secret' }),
    (error) => error.code === 'invalid_model',
  );
});

test('STT selection can switch to the local whisper adapter', () => {
  resetEnv({ STT_PROVIDER: 'local_whisper', LOCAL_STT_BASE_URL: 'http://127.0.0.1:8080' });
  const providers = loadProviders();
  const selected = providers.resolveSelection('stt', { provider: 'local_whisper', model: 'small' });
  assert.equal(selected.provider, 'local_whisper');
  assert.equal(selected.model, 'small');
  assert.equal(selected.adapter.live, true);
});

test('model allowlists validate tenant-selected models', () => {
  resetEnv({
    GROQ_ALLOWED_MODELS: 'llama-3.3-70b-versatile,openai/gpt-oss-20b',
    GEMINI_ALLOWED_MODELS: 'gemini-flash-latest,gemini-2.5-flash',
  });
  const providers = loadProviders();
  assert.equal(
    providers.resolveSelection('llm', { provider: 'groq', model: 'openai/gpt-oss-20b' }).model,
    'openai/gpt-oss-20b',
  );
  assert.throws(
    () => providers.resolveSelection('llm', { provider: 'groq', model: 'other-model' }),
    (error) => error.code === 'model_not_enabled',
  );
  assert.equal(
    providers.resolveSelection('llm', { provider: 'gemini', model: 'gemini-2.5-flash' }).model,
    'gemini-2.5-flash',
  );
  assert.throws(
    () => providers.resolveSelection('llm', { provider: 'gemini', model: 'gemini-3-unknown' }),
    (error) => error.code === 'model_not_enabled',
  );
});

test('registry contract accepts a complete mock TTS adapter and rejects incomplete adapters', async () => {
  resetEnv();
  const providers = loadProviders();
  assert.throws(
    () => providers.registerProvider('tts', { id: 'broken', layer: 'tts', synthesize: async () => ({}) }),
    (error) => error.code === 'invalid_provider_adapter',
  );
  const mock = {
    id: 'mock_tts', label: 'Mock TTS', layer: 'tts', needs: [], implemented: true,
    models: new Set(['mock-v1']), model: 'mock-v1', live: true,
    async synthesize({ text }) { return { buffer: Buffer.from(text), chars: text.length }; },
    async wsConnect() { return { ws_url: 'wss://example.test', token: 'ephemeral' }; },
  };
  providers.registerProvider('tts', mock);
  const selected = providers.resolveSelection('tts', { provider: 'mock_tts', model: 'mock-v1' });
  assert.equal(selected.adapter, mock);
  assert.equal((await selected.adapter.synthesize({ text: 'hello' })).chars, 5);
});

test('Groq adapter sends selected model and normalizes its response with mocked HTTP', async () => {
  resetEnv({ GROQ_API_KEY: 'groq-test', LLM_PROVIDER: 'groq' });
  let request;
  const providers = loadProviders({ httpsPost: async (host, path, headers, body) => {
    request = { host, path, headers, payload: JSON.parse(body.toString('utf8')) };
    return {
      status: 200,
      headers: {},
      buffer: Buffer.from(JSON.stringify({ choices: [{ message: { content: 'Hello.' }, finish_reason: 'stop' }] })),
    };
  } });
  const output = await providers.llm.chat({
    model: 'openai/gpt-oss-20b', messages: [{ role: 'user', text: 'Hi' }],
  });
  assert.equal(request.host, 'api.groq.com');
  assert.equal(request.path, '/openai/v1/chat/completions');
  assert.equal(request.payload.model, 'openai/gpt-oss-20b');
  assert.equal(request.headers.Authorization, 'Bearer groq-test');
  assert.equal(output.text, 'Hello.');
  assert.equal(output.provider, 'groq');
  assert.equal(output.model, 'openai/gpt-oss-20b');
});

test('environment dispatches the same LLM contract to the fully wired Gemini adapter', async () => {
  resetEnv({ GEMINI_API_KEY: 'gemini-test', LLM_PROVIDER: 'gemini' });
  let pathSeen = '';
  const providers = loadProviders({ httpsPost: async (_host, path) => {
    pathSeen = path;
    return {
      status: 200,
      headers: {},
      buffer: Buffer.from(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Namaste.' }] }, finishReason: 'STOP' }],
      })),
    };
  } });
  const output = await providers.llm.chat({
    model: 'gemini-2.5-flash', messages: [{ role: 'user', text: 'Hi' }],
  });
  assert.match(pathSeen, /gemini-2\.5-flash:generateContent/);
  assert.equal(output.provider, 'gemini');
  assert.equal(output.model, 'gemini-2.5-flash');
  assert.equal(output.text, 'Namaste.');
});

test('Rumik adapter validates its model and synthesizes with mocked HTTP', async () => {
  resetEnv({ RUMIK_API_KEY: 'rumik-test' });
  let payload;
  const providers = loadProviders({ httpsPost: async (_host, _path, _headers, body) => {
    payload = JSON.parse(body.toString('utf8'));
    return { status: 200, headers: { 'x-credits-used': '1' }, buffer: Buffer.from('RIFFmock') };
  } });
  const output = await providers.get('tts', 'rumik').synthesize({ text: 'Hello', model: 'mulberry' });
  assert.equal(payload.model, 'mulberry');
  assert.equal(output.chars, 5);
  assert.throws(
    () => providers.resolveSelection('tts', { provider: 'rumik', model: 'unknown' }),
    (error) => error.code === 'unsupported_model',
  );
});

test('Deepgram transcription still works as a fallback STT path', async () => {
  resetEnv({ DEEPGRAM_API_KEY: 'deepgram-test' });
  let request;
  const providers = loadProviders({ httpsPost: async (host, path, headers) => {
    request = { host, path, headers };
    return {
      status: 200,
      headers: {},
      buffer: Buffer.from(JSON.stringify({ results: { channels: [{ alternatives: [{ transcript: 'hello' }] }] } })),
    };
  } });
  const output = await providers.get('stt', 'deepgram').transcribe({ audio: Buffer.alloc(300).toString('base64'), mime: 'audio/webm' });
  assert.equal(request.host, 'api.deepgram.com');
  assert.match(request.path, /model=nova-3/);
  assert.equal(request.headers.Authorization, 'Token deepgram-test');
  assert.equal(output.provider, 'deepgram');
  assert.equal(output.text, 'hello');
});

test('local whisper uses an OpenAI-compatible transcription endpoint', async () => {
  resetEnv({ STT_PROVIDER: 'local_whisper', LOCAL_STT_BASE_URL: 'http://127.0.0.1:8080', LOCAL_STT_MODEL: 'small', LOCAL_STT_LANGUAGE: 'pt' });
  let request;
  const providers = loadProviders({ requestUrl: async (url, options) => {
    request = { url, options };
    return {
      status: 200,
      headers: {},
      buffer: Buffer.from(JSON.stringify({ text: 'ola mundo' })),
    };
  } });
  const output = await providers.stt.transcribe({ audio: Buffer.alloc(300).toString('base64'), mime: 'audio/webm' });
  assert.equal(request.url, 'http://127.0.0.1:8080/v1/audio/transcriptions');
  assert.equal(request.options.method, 'POST');
  assert.match(request.options.headers['Content-Type'], /^multipart\/form-data; boundary=/);
  assert.equal(output.provider, 'local_whisper');
  assert.equal(output.model, 'small');
  assert.equal(output.text, 'ola mundo');
});

test('local piper uses an OpenAI-compatible speech endpoint', async () => {
  resetEnv({ TTS_PROVIDER: 'local_piper', LOCAL_TTS_BASE_URL: 'http://127.0.0.1:8090', LOCAL_TTS_VOICE: 'pt_BR-test' });
  let request;
  const providers = loadProviders({ requestUrl: async (url, options) => {
    request = { url, options, payload: JSON.parse(options.body.toString('utf8')) };
    return { status: 200, headers: {}, buffer: Buffer.from('RIFFlocal') };
  } });
  const output = await providers.tts.synthesize({ text: 'Bom dia' });
  assert.equal(request.url, 'http://127.0.0.1:8090/v1/audio/speech');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.payload.voice, 'pt_BR-test');
  assert.equal(request.payload.response_format, 'wav');
  assert.equal(output.chars, 7);
});

test('BR DID telephony status is read from Asterisk ARI', async () => {
  resetEnv({
    TELEPHONY_PROVIDER: 'brdid_asterisk',
    ASTERISK_ARI_URL: 'http://127.0.0.1:8088/ari',
    ASTERISK_ARI_USERNAME: 'ari-user',
    ASTERISK_ARI_PASSWORD: 'ari-pass',
    ASTERISK_ARI_APP: 'rapidx',
    ASTERISK_SIP_ENDPOINT_ID: 'brdid-trunk',
    BRDID_SIP_SERVER: 'sip.brdid.example',
    BRDID_SIP_USERNAME: '1001',
    BRDID_SIP_PASSWORD: 'secret',
    BRDID_CALLER_ID: '+556533333333',
    DOGRAH_BASE_URL: 'https://dograh.example.test',
    DOGRAH_API_KEY: 'dograh-key',
    DOGRAH_WORKFLOW_ID: '12',
    DOGRAH_TELEPHONY_CONFIG_ID: '34',
    DOGRAH_PHONE_NUMBER_ID: '56',
  });
  const calls = [];
  const providers = loadProviders({ requestUrl: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/asterisk/info')) {
      return { status: 200, headers: {}, buffer: Buffer.from(JSON.stringify({ asterisk_version: '20.7.0' })) };
    }
    if (url.endsWith('/endpoints/PJSIP/brdid-trunk')) {
      return { status: 200, headers: {}, buffer: Buffer.from(JSON.stringify({ technology: 'PJSIP', resource: 'brdid-trunk', state: 'online' })) };
    }
    throw new Error('unexpected request ' + url);
  } });
  const status = await providers.telephony.status();
  assert.equal(calls.length, 2);
  assert.equal(status.provider, 'brdid_asterisk');
  assert.equal(status.orchestrator, 'asterisk_ari');
  assert.equal(status.sipRegistration, 'online');
  assert.equal(status.dids[0].number, '+556533333333');
});

test('BR DID dialing creates the Dograh workflow run before ARI originates the trunk endpoint', async () => {
  resetEnv({
    TELEPHONY_PROVIDER: 'brdid_asterisk',
    ASTERISK_ARI_URL: 'http://asterisk:8088/ari',
    ASTERISK_ARI_USERNAME: 'rapidx',
    ASTERISK_ARI_PASSWORD: 'ari-pass',
    ASTERISK_ARI_APP: 'rapidx',
    BRDID_SIP_SERVER: 'sip.brdid.example',
    BRDID_SIP_USERNAME: '1001',
    BRDID_SIP_PASSWORD: 'secret',
    BRDID_CALLER_ID: '+556533333333',
    ASTERISK_ARI_ENDPOINT_TEMPLATE: 'PJSIP/brdid/sip:{number}@sip.brdid.example',
    DOGRAH_BASE_URL: 'https://dograh.example.test',
    DOGRAH_API_KEY: 'dograh-key',
    DOGRAH_WORKFLOW_ID: '12',
    DOGRAH_TELEPHONY_CONFIG_ID: '34',
    DOGRAH_PHONE_NUMBER_ID: '56',
  });
  let request;
  const providers = loadProviders({ httpsPost: async (host, path, headers, body) => {
    request = { host, path, headers, payload: JSON.parse(body.toString('utf8')) };
    return { status: 201, headers: {}, buffer: Buffer.from(JSON.stringify({ id: 'run-1' })) };
  } });
  const result = await providers.telephony.dial('+5565999999999');
  assert.equal(request.host, 'dograh.example.test');
  assert.equal(request.path, '/api/v1/telephony/initiate-call');
  assert.equal(request.headers['X-API-Key'], 'dograh-key');
  assert.deepEqual(request.payload, {
    workflow_id: 12,
    telephony_configuration_id: 34,
    from_phone_number_id: 56,
    phone_number: 'PJSIP/brdid/sip:5565999999999@sip.brdid.example',
  });
  assert.equal(result.status, 201);
});
