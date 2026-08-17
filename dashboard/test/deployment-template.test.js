'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('cloud environment template includes the server-side Dograh WebRTC token', () => {
  const template = fs.readFileSync(path.join(__dirname, '..', '..', '.env.example'), 'utf8');
  assert.match(template, /^DOGRAH_EMBED_TOKEN=$/m);
});

test('Telnyx deployment variables are present without changing the speech defaults', () => {
  const template = fs.readFileSync(path.join(__dirname, '..', '..', '.env.example'), 'utf8');
  assert.match(template, /^DOGRAH_HOST=dograh\.wayno\.com\.br$/m);
  assert.match(template, /^DOGRAH_BASE_URL=https:\/\/dograh\.wayno\.com\.br$/m);
  assert.match(template, /^DASHBOARD_HOST=rapidix\.wayno\.com\.br$/m);
  assert.match(template, /^TELEPHONY_PROVIDER=telnyx$/m);
  assert.match(template, /^TELNYX_API_KEY=$/m);
  assert.match(template, /^TELNYX_NUMBER=$/m);
  assert.match(template, /^TELNYX_CONNECTION_ID=$/m);
  assert.match(template, /^TELNYX_WEBHOOK_PUBLIC_KEY=$/m);
  assert.match(template, /^STT_PROVIDER=local_whisper$/m);
  assert.match(template, /^TTS_PROVIDER=local_piper$/m);
  assert.match(template, /^LLM_PROVIDER=groq$/m);
});

test('Telnyx configuration does not invoke the voice pipeline or a PSTN call', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', '..', 'deploy', '08-configure-telnyx.sh'), 'utf8');
  assert.match(script, /docker run -d --name rapidx-voice/);
  assert.doesNotMatch(script, /model-configurations|initiate-call/);
});

test('Telnyx activation validates the active mobile caller ID before Dograh changes', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', '..', 'deploy', '08-configure-telnyx.sh'), 'utf8');
  assert.match(script, /DOGRAH_BASE_URL="\$\{DOGRAH_BASE_URL:-\$BASE\}"/);
  assert.match(script, /\/connections\/\$TELNYX_CONNECTION_ID/);
  assert.match(script, /filter%5Bphone_number%5D=/);
  assert.match(script, /phone_number_type.*mobile/);
  assert.match(script, /\/workflow\/fetch\/\$DOGRAH_WORKFLOW_ID/);
  assert.ok(script.indexOf('validate_telnyx_resources\n\nTOK=') > -1);
  assert.ok(script.indexOf('validate_dograh_workflow\n\nfind_telnyx_config') > -1);
});
