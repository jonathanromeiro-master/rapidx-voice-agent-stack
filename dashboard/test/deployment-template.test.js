'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('cloud environment template includes the server-side Dograh WebRTC token', () => {
  const template = fs.readFileSync(path.join(__dirname, '..', '..', '.env.example'), 'utf8');
  assert.match(template, /^DOGRAH_EMBED_TOKEN=$/m);
});
