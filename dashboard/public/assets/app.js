'use strict';
/* ==========================================================================
   RapidX Voice , Console (product dashboard) SPA.
   Vanilla JS. Zero dependencies. Hash routing. Talks only to our own /api/*
   so provider keys stay server side. No em dashes anywhere. Use commas or periods.
   ========================================================================== */

/* ---------- tiny DOM helpers ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const el = (tag, attrs, kids) => {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
    else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
  }
  if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach((c) => {
    if (c == null || c === false) return;
    n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  });
  return n;
};

/* XSS guard. Always escape any user supplied string before it touches innerHTML.
   Most rendering uses el()+textContent which is safe by construction. esc() is the
   belt-and-suspenders for the rare html: paths. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------- app state ---------- */
const State = {
  me: null,            // { user, tenant }
  health: null,        // { ok, providers, model }
  agents: [],
  providers: null,
  usage: null,
  telephony: null,
  activeAgentId: null, // for Talk-to-it
  loaded: { agents: false, providers: false, usage: false, telephony: false }
};

const VOICE_MODELS = ['mulberry', 'muga'];
const SPEAKERS = ['speaker_1', 'speaker_2', 'speaker_3', 'speaker_4'];
const MUGA_TONES = ['neutral', 'happy', 'sad', 'excited', 'angry', 'whisper'];
/* Rs per 1000 chars. Mulberry promo about Rs 0.50 / 1000. Muga slightly higher. */
const RATE = { mulberry: 0.50, muga: 0.99 };

/* ===========================================================================
   FETCH WRAPPER
   credentials:include so the rxv_sess cookie rides along. JSON in, JSON out.
   A 401 on any authed call bounces to the login card.
   =========================================================================== */
async function api(path, opts) {
  opts = opts || {};
  const init = { method: opts.method || 'GET', credentials: 'include', headers: {} };
  if (opts.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch (e) {
    throw new ApiError(0, 'Network error. Is the server running.');
  }
  if (res.status === 401 && !opts.allow401) {
    State.me = null;
    if (!path.endsWith('/api/me')) renderAuth();
    throw new ApiError(401, 'Please sign in.');
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.indexOf('application/json') !== -1) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error || data.message || ('Request failed (' + res.status + ').'), data);
    return data;
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new ApiError(res.status, txt || ('Request failed (' + res.status + ').'));
  }
  return res; // raw (e.g. audio/wav)
}
function ApiError(status, message, data) { this.status = status; this.message = message; this.data = data || {}; }
ApiError.prototype = Object.create(Error.prototype);

/* ===========================================================================
   TOASTS
   =========================================================================== */
function toast(message, kind, title) {
  kind = kind || 'info';
  const host = $('#toasts');
  const t = el('div', { class: 'toast ' + kind }, [
    el('span', { class: 'ti' }),
    el('div', {}, [title ? el('b', {}, title) : null, el('div', {}, message)])
  ]);
  host.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, kind === 'err' ? 5200 : 3400);
}

/* ===========================================================================
   MODAL
   =========================================================================== */
function modal(opts) {
  // opts: { title, body(node), confirmText, confirmKind, onConfirm, cancelText }
  const host = $('#modal-host');
  const close = () => { host.classList.add('hide'); host.setAttribute('aria-hidden', 'true'); host.innerHTML = ''; };
  const confirmBtn = el('button', { class: 'btn ' + (opts.confirmKind === 'danger' ? 'btn-primary' : 'btn-primary') }, opts.confirmText || 'Confirm');
  if (opts.confirmKind === 'danger') confirmBtn.style.background = 'linear-gradient(100deg,#fb7185,#e11d48)';
  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    try { await opts.onConfirm(); close(); }
    catch (e) { confirmBtn.disabled = false; toast(e.message || 'Action failed.', 'err'); }
  });
  const card = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, [
    el('h3', {}, opts.title || ''),
    opts.body || null,
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', onclick: close }, opts.cancelText || 'Cancel'),
      confirmBtn
    ])
  ]);
  host.innerHTML = '';
  host.appendChild(el('div', { onclick: (e) => { if (e.target === e.currentTarget) close(); }, style: 'position:absolute;inset:0' }));
  host.appendChild(card);
  host.classList.remove('hide');
  host.setAttribute('aria-hidden', 'false');
  return close;
}

/* ===========================================================================
   SMALL UTILITIES
   =========================================================================== */
function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join('').toUpperCase() || '?';
}
function brandSVG(size) {
  // Inline logo mark, gradient. Returns an <svg> node so we never depend on logo.svg loading.
  const ns = 'http://www.w3.org/2000/svg';
  const gid = 'lg' + Math.random().toString(36).slice(2, 7);
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('width', size || 30); svg.setAttribute('height', size || 30);
  svg.innerHTML =
    '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#34E7E4"/><stop offset="0.55" stop-color="#6E7BFF"/><stop offset="1" stop-color="#A855F7"/>' +
    '</linearGradient></defs>' +
    '<path d="M20 3 L34 11 V29 L20 37 L6 29 V11 Z" fill="none" stroke="url(#' + gid + ')" stroke-width="2"/>' +
    '<path d="M14 20 h2 l2 -6 3 12 2 -8 2 4 h3" fill="none" stroke="url(#' + gid + ')" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
}
function fmtInr(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function skeleton(kind, n) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < (n || 1); i++) frag.appendChild(el('div', { class: 'sk ' + (kind || 'sk-card') }));
  return frag;
}

/* ===========================================================================
   BOOT
   =========================================================================== */
async function boot() {
  try {
    const me = await api('/api/me', { allow401: true });
    State.me = me;
    renderShell();
  } catch (e) {
    if (e.status === 401) renderAuth();
    else { renderAuth(); }
  }
}

/* ===========================================================================
   AUTH GATE
   =========================================================================== */
function renderAuth() {
  let mode = 'login'; // or 'signup'
  const root = $('#app');
  root.removeAttribute('aria-busy');

  function draw() {
    const errBox = el('div', { class: 'auth-err', id: 'authErr' });
    const fields = [];
    if (mode === 'signup') {
      fields.push(field('Your name', el('input', { class: 'input', id: 'f_name', type: 'text', placeholder: 'Shreyas Raj', autocomplete: 'name' })));
      fields.push(field('Company', el('input', { class: 'input', id: 'f_company', type: 'text', placeholder: 'Acme Co', autocomplete: 'organization' })));
    }
    fields.push(field('Email', el('input', { class: 'input', id: 'f_email', type: 'email', placeholder: 'you@company.com', autocomplete: 'email' })));
    fields.push(field('Password', el('input', { class: 'input', id: 'f_pass', type: 'password', placeholder: '••••••••', autocomplete: mode === 'signup' ? 'new-password' : 'current-password' })));

    const submit = el('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, mode === 'login' ? 'Sign in' : 'Create account');

    const form = el('form', { class: 'auth-form', onsubmit: onSubmit }, fields.concat([errBox, submit]));

    const card = el('div', { class: 'auth-card' }, [
      el('div', { class: 'auth-brand' }, [
        (function () { const s = brandSVG(34); s.classList.add('lm'); return s; })(),
        el('span', { class: 'nm' }, [document.createTextNode('RapidX '), el('em', {}, 'Voice')])
      ]),
      el('h1', {}, mode === 'login' ? 'Welcome back' : 'Start building'),
      el('p', { class: 'sub' }, mode === 'login' ? 'Sign in to your voice agent console.' : 'Spin up a tenant and ship production voice agents at roughly one rupee.'),
      form,
      el('div', { class: 'auth-toggle' }, [
        document.createTextNode(mode === 'login' ? 'New to RapidX Voice. ' : 'Already have an account. '),
        el('button', { type: 'button', onclick: () => { mode = mode === 'login' ? 'signup' : 'login'; draw(); } }, mode === 'login' ? 'Create one' : 'Sign in')
      ]),
      mode === 'login' ? el('div', { class: 'auth-demo' }, [
        document.createTextNode('Demo tenant: '),
        el('code', {}, 'demo@rapidx.ai'), document.createTextNode(' / '), el('code', {}, 'rapidxvoice')
      ]) : null
    ]);

    root.innerHTML = '';
    root.appendChild(el('div', { class: 'auth-wrap' }, card));
    const first = $('#' + (mode === 'signup' ? 'f_name' : 'f_email'));
    if (first) first.focus();
  }

  function field(label, input) {
    return el('div', { class: 'field' }, [el('label', {}, label), input]);
  }

  async function onSubmit(e) {
    e.preventDefault();
    const err = $('#authErr');
    err.classList.remove('show');
    const email = ($('#f_email').value || '').trim();
    const password = $('#f_pass').value || '';
    if (!email || !password) { showErr('Email and password are required.'); return; }
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = mode === 'login' ? 'Signing in...' : 'Creating...';
    try {
      let body, route;
      if (mode === 'signup') {
        body = { email: email, password: password, name: ($('#f_name').value || '').trim(), company: ($('#f_company').value || '').trim() };
        route = '/api/auth/signup';
      } else {
        body = { email: email, password: password };
        route = '/api/auth/login';
      }
      const res = await api(route, { method: 'POST', body: body, allow401: true });
      State.me = { user: res.user, tenant: res.tenant };
      resetData();
      toast(mode === 'login' ? 'Signed in.' : 'Account created.', 'ok');
      renderShell();
    } catch (ex) {
      btn.disabled = false; btn.textContent = mode === 'login' ? 'Sign in' : 'Create account';
      if (ex.status === 409) showErr('That email is already registered. Try signing in.');
      else if (ex.status === 401) showErr('Wrong email or password.');
      else showErr(ex.message || 'Something went wrong.');
    }
  }
  function showErr(m) { const err = $('#authErr'); err.textContent = m; err.classList.add('show'); }

  draw();
}
function resetData() {
  State.agents = []; State.providers = null; State.usage = null; State.telephony = null;
  State.loaded = { agents: false, providers: false, usage: false, telephony: false };
  State.activeAgentId = null;
}

/* ===========================================================================
   CONSOLE SHELL
   =========================================================================== */
const ROUTES = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'agents', label: 'Agents', icon: 'users' },
  { id: 'studio', label: 'Voice Studio', icon: 'wave' },
  { id: 'talk', label: 'Talk to it', icon: 'mic' },
  { id: 'telephony', label: 'Telephony', icon: 'phone' },
  { id: 'settings', label: 'Settings', icon: 'gear' }
];

function navIcon(name) {
  const paths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 6.2a3 3 0 0 1 0 5.6"/><path d="M17 14.5a5.5 5.5 0 0 1 3.5 5.5"/>',
    wave: '<path d="M2 12h2l2-6 3 14 3-18 3 14 2-6h2"/>',
    mic: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/><path d="M8.5 21h7"/>',
    phone: '<path d="M5 3.5h3l1.5 4.5-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.1 1.5 1.5 0 0 1 5 3.5z"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5"/>',
    logout: '<path d="M14 3.5H6.5A1.5 1.5 0 0 0 5 5v14a1.5 1.5 0 0 0 1.5 1.5H14"/><path d="M17 8l4 4-4 4"/><path d="M21 12H9"/>'
  };
  return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || paths.grid) + '</svg>';
}

function renderShell() {
  const root = $('#app');
  root.removeAttribute('aria-busy');
  const t = State.me.tenant, u = State.me.user;

  const nav = el('nav', { class: 'nav' }, ROUTES.map((r) =>
    el('a', { href: '#/' + r.id, 'data-route': r.id, html: navIcon(r.icon) + '<span>' + esc(r.label) + '</span>' })
  ));

  const side = el('aside', { class: 'side' }, [
    el('div', { class: 'side-brand' }, [
      (function () { const s = brandSVG(30); s.classList.add('lm'); return s; })(),
      el('span', { class: 'nm' }, [document.createTextNode('RapidX '), el('em', {}, 'Voice')])
    ]),
    nav,
    el('div', { class: 'side-foot' }, [
      el('div', { class: 'tenant-chip' }, [
        el('div', { class: 'av' }, initials(t.name)),
        el('div', { class: 'meta' }, [
          el('div', { class: 'tn', title: t.name }, t.name),
          el('div', { class: 'tp' }, (t.plan || 'studio') + ' plan')
        ])
      ]),
      el('button', { class: 'side-logout', onclick: doLogout, html: navIcon('logout') + '<span>Sign out</span>' })
    ])
  ]);

  const top = el('header', { class: 'top' }, [
    el('div', { class: 'flex items-center gap-2', style: 'min-width:0' }, [
      el('button', { class: 'menu-btn', 'aria-label': 'Menu', onclick: () => $('.shell').classList.toggle('nav-open'), html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>' }),
      el('div', { class: 'top-route' }, [
        el('span', { class: 'crumb' }, 'RapidX Voice'),
        el('span', { class: 'ttl', id: 'routeTitle' }, 'Overview')
      ])
    ]),
    el('div', { class: 'health-row', id: 'healthRow' }, healthChips())
  ]);

  const shell = el('div', { class: 'shell' }, [
    side, top,
    el('main', { class: 'main', id: 'view' }),
    el('div', { class: 'nav-scrim', onclick: () => $('.shell').classList.remove('nav-open') })
  ]);

  root.innerHTML = '';
  root.appendChild(shell);

  window.removeEventListener('hashchange', onRoute);
  window.addEventListener('hashchange', onRoute);
  loadHealth();
  onRoute();
}

async function doLogout() {
  try { await api('/api/auth/logout', { method: 'POST', allow401: true }); } catch (e) {}
  State.me = null; resetData();
  toast('Signed out.', 'info');
  renderAuth();
}

/* ---- health chips ---- */
function healthChips() {
  const layers = [
    { key: 'tts', label: 'TTS' },
    { key: 'llm', label: 'Brain' },
    { key: 'telephony', label: 'Telephony' }
  ];
  return layers.map((L) => {
    const chip = el('span', { class: 'hchip loading', 'data-layer': L.key }, [
      el('span', { class: 'dot' }),
      el('span', { class: 'lbl-txt' }, L.label)
    ]);
    return chip;
  });
}
async function loadHealth() {
  try {
    const h = await api('/api/health', { allow401: true });
    State.health = h;
    paintHealth();
  } catch (e) {
    $$('#healthRow .hchip').forEach((c) => { c.className = 'hchip bad'; });
  }
}
function paintHealth() {
  const h = State.health; if (!h) return;
  const map = {
    tts: h.providers && h.providers.tts ? Object.values(h.providers.tts).some(Boolean) : false,
    llm: h.providers && h.providers.llm ? Object.values(h.providers.llm).some(Boolean) : false,
    telephony: h.providers && h.providers.telephony ? Object.values(h.providers.telephony).some(Boolean) : false
  };
  $$('#healthRow .hchip').forEach((c) => {
    const layer = c.getAttribute('data-layer');
    c.classList.remove('loading');
    c.className = 'hchip ' + (map[layer] ? 'ok' : 'bad');
    c.setAttribute('data-layer', layer);
  });
}

/* ===========================================================================
   ROUTER
   =========================================================================== */
function currentRoute() {
  const hash = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
  const found = ROUTES.find((r) => r.id === hash);
  return found ? found.id : 'overview';
}
function onRoute() {
  if (!State.me) return;
  const id = currentRoute();
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('data-route') === id));
  const r = ROUTES.find((x) => x.id === id);
  const tt = $('#routeTitle'); if (tt) tt.textContent = r ? r.label : 'Overview';
  $('.shell') && $('.shell').classList.remove('nav-open');
  const view = $('#view');
  view.innerHTML = '';
  const wrap = el('div', { class: 'view' });
  view.appendChild(wrap);
  ({
    overview: viewOverview, agents: viewAgents, studio: viewStudio,
    talk: viewTalk, telephony: viewTelephony, settings: viewSettings
  }[id] || viewOverview)(wrap);
}
function goto(id) { location.hash = '#/' + id; }

/* ---- shared view header ---- */
function viewHead(title, sub) {
  return el('div', { class: 'view-head' }, [el('h2', {}, title), sub ? el('p', {}, sub) : null]);
}

/* ===========================================================================
   1. OVERVIEW
   =========================================================================== */
async function viewOverview(root) {
  const name = State.me.user.name || State.me.user.email;
  root.appendChild(viewHead('Welcome back, ' + name + '.', 'Your voice stack at a glance. Provider health, usage, and the fastest way into a build.'));

  const statsRow = el('div', { class: 'grid grid-3' }, skeleton('sk-stat', 3));
  root.appendChild(statsRow);

  const body = el('div', { class: 'grid grid-12', style: 'margin-top:18px' }, [
    el('div', { class: 'card spark-card', id: 'sparkHost' }, skeleton('sk-card', 1)),
    el('div', { class: 'card card-pad', id: 'qaHost' }, [
      el('h3', { class: 't-h3', style: 'margin-bottom:14px' }, 'Quick actions'),
      el('div', { class: 'qa-row' }, [
        el('button', { class: 'btn btn-primary', onclick: () => goto('agents') }, 'Build an agent'),
        el('button', { class: 'btn btn-ghost', onclick: () => goto('studio') }, 'Open Voice Studio'),
        el('button', { class: 'btn btn-ghost', onclick: () => goto('talk') }, 'Talk to it'),
        el('button', { class: 'btn btn-ghost', onclick: () => goto('telephony') }, 'Telephony')
      ]),
      el('div', { class: 'divider', style: 'margin:18px 0' }),
      el('div', { id: 'provMini', class: 'soft', style: 'font-size:.85rem' }, 'Checking providers...')
    ])
  ]);
  root.appendChild(body);

  // load usage + agents in parallel
  try {
    const [usage, agentsRes] = await Promise.all([
      api('/api/usage'),
      State.loaded.agents ? Promise.resolve({ agents: State.agents }) : api('/api/agents')
    ]);
    State.usage = usage;
    State.agents = agentsRes.agents || [];
    State.loaded.agents = true;

    const totals = usage.totals || {};
    statsRow.innerHTML = '';
    statsRow.appendChild(statCard('Agents', String(State.agents.length), 'Live in this tenant'));
    statsRow.appendChild(statCard('Characters synthesized', fmtInr(totals.chars || 0), 'Across all days'));
    statsRow.appendChild(statCard('Estimated spend', '₹' + fmtInr(totals.costInr || estimateCost(usage)), 'At promo rates', true));

    const sh = $('#sparkHost'); sh.innerHTML = '';
    sh.appendChild(sparkPanel(usage.days || []));
  } catch (e) {
    statsRow.innerHTML = '';
    statsRow.appendChild(el('div', { class: 'card card-pad muted' }, 'Could not load usage. ' + esc(e.message)));
  }

  // provider mini summary
  ensureProviders().then(() => {
    const pm = $('#provMini'); if (!pm) return;
    const reg = State.providers || {};
    const live = [];
    ['tts', 'llm', 'telephony'].forEach((layer) => {
      (reg[layer] || []).forEach((p) => { if (p.live) live.push(p.label); });
    });
    pm.textContent = live.length ? ('Active providers: ' + live.join(', ') + '.') : 'No live providers detected.';
  }).catch(() => {});
}

function statCard(lbl, val, delta, up) {
  return el('div', { class: 'card stat' }, [
    el('div', { class: 'lbl' }, lbl),
    el('div', { class: 'val' }, val),
    el('div', { class: 'delta' + (up ? ' up' : '') }, delta)
  ]);
}
function estimateCost(usage) {
  // fallback if backend does not return costInr in totals
  let c = 0;
  (usage.days || []).forEach((d) => { c += (d.costInr || (d.chars || 0) / 1000 * RATE.mulberry); });
  return Math.round(c * 100) / 100;
}

/* ---- sparkline (inline SVG, no libs) ---- */
function sparkPanel(days) {
  const data = (days || []).map((d) => ({ day: d.day, v: d.chars || 0 }));
  const total = data.reduce((s, d) => s + d.v, 0);
  const head = el('div', { class: 'hd' }, [
    el('div', { class: 't' }, 'Usage, characters per day'),
    el('div', { class: 'v' }, fmtInr(total) + ' total')
  ]);
  const svg = buildSpark(data);
  const xlabels = el('div', { class: 'spark-x' }, [
    el('span', {}, data.length ? shortDay(data[0].day) : ''),
    el('span', {}, data.length ? shortDay(data[data.length - 1].day) : 'no data yet')
  ]);
  return el('div', {}, [head, svg, xlabels]);
}
function shortDay(iso) {
  if (!iso) return '';
  const p = iso.split('-'); return p.length === 3 ? (p[2] + '/' + p[1]) : iso;
}
function buildSpark(data) {
  const W = 600, H = 120, pad = 6;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'spark-svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML =
    '<defs>' +
    '<linearGradient id="sparkline" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#34E7E4"/><stop offset="0.6" stop-color="#6E7BFF"/><stop offset="1" stop-color="#A855F7"/></linearGradient>' +
    '<linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6E7BFF" stop-opacity="0.32"/><stop offset="1" stop-color="#6E7BFF" stop-opacity="0"/></linearGradient>' +
    '</defs>';
  if (!data.length) {
    const txt = document.createElementNS(ns, 'text');
    txt.setAttribute('x', W / 2); txt.setAttribute('y', H / 2 + 4); txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('fill', '#5C6479'); txt.setAttribute('font-size', '13'); txt.setAttribute('font-family', 'monospace');
    txt.textContent = 'Synthesize something to see usage here.';
    svg.appendChild(txt);
    return svg;
  }
  const max = Math.max(1, ...data.map((d) => d.v));
  const n = data.length;
  const x = (i) => pad + (n === 1 ? (W - 2 * pad) / 2 : (i / (n - 1)) * (W - 2 * pad));
  const y = (v) => H - pad - (v / max) * (H - 2 * pad);
  let line = '';
  data.forEach((d, i) => { line += (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(d.v).toFixed(1) + ' '; });
  const area = 'M' + x(0).toFixed(1) + ' ' + (H - pad) + ' ' + line.replace(/^M/, 'L') + 'L' + x(n - 1).toFixed(1) + ' ' + (H - pad) + ' Z';
  const areaP = document.createElementNS(ns, 'path'); areaP.setAttribute('class', 'area'); areaP.setAttribute('d', area);
  const lineP = document.createElementNS(ns, 'path'); lineP.setAttribute('class', 'ln'); lineP.setAttribute('d', line.trim());
  svg.appendChild(areaP); svg.appendChild(lineP);
  // last point dot
  const c = document.createElementNS(ns, 'circle');
  c.setAttribute('cx', x(n - 1)); c.setAttribute('cy', y(data[n - 1].v)); c.setAttribute('r', 3.2);
  c.setAttribute('fill', '#A855F7'); c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', '1');
  svg.appendChild(c);
  return svg;
}

/* ===========================================================================
   PROVIDERS + AGENTS data loaders
   =========================================================================== */
async function ensureProviders() {
  if (State.loaded.providers) return State.providers;
  const res = await api('/api/providers');
  // res can be { tts:[...], llm:[...], telephony:[...] } or { providers:{...} }
  State.providers = res.providers || res;
  State.loaded.providers = true;
  return State.providers;
}
async function ensureAgents(force) {
  if (State.loaded.agents && !force) return State.agents;
  const res = await api('/api/agents');
  State.agents = res.agents || [];
  State.loaded.agents = true;
  return State.agents;
}
async function ensureTelephony(force) {
  if (State.loaded.telephony && !force) return State.telephony;
  const res = await api('/api/telephony/status');
  State.telephony = res;
  State.loaded.telephony = true;
  return State.telephony;
}

/* ===========================================================================
   2. AGENTS
   =========================================================================== */
async function viewAgents(root) {
  root.appendChild(viewHead('Agents', 'Each agent is a persona plus a voice. Preview the voice, then assign a number and ship it.'));

  const builder = buildAgentForm(null);
  root.appendChild(builder);

  const gridHost = el('div', { id: 'agentsGrid', class: 'agents-grid', style: 'margin-top:22px' }, skeleton('sk-card', 3));
  root.appendChild(gridHost);

  try {
    await Promise.all([ensureAgents(true), ensureTelephony().catch(() => null), ensureProviders().catch(() => null)]);
    refillDidOptions();
    paintAgents();
  } catch (e) {
    gridHost.innerHTML = '';
    gridHost.appendChild(el('div', { class: 'empty muted' }, 'Could not load agents. ' + esc(e.message)));
  }
}

function dids() {
  const t = State.telephony || {};
  const list = t.dids || (t.did ? [{ number: t.did }] : []);
  return list.map((d) => (typeof d === 'string' ? d : d.number || d.did)).filter(Boolean);
}
function refillDidOptions() {
  const sel = $('#f_did'); if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '';
  sel.appendChild(el('option', { value: '' }, 'No number assigned'));
  dids().forEach((n) => sel.appendChild(el('option', { value: n }, n)));
  if (cur) sel.value = cur;
}

function buildAgentForm(existing) {
  const e = existing || {};
  const tts = e.tts || {};
  const card = el('div', { class: 'card builder' });
  const state = {
    model: tts.model || 'mulberry',
    speaker: tts.speaker || 'speaker_2',
    f0: tts.f0_up_key != null ? tts.f0_up_key : 0
  };

  const nameI = el('input', { class: 'input', id: 'f_name', type: 'text', value: e.name || '', placeholder: 'Front Desk', maxlength: 80 });
  const personaI = el('textarea', { class: 'textarea', id: 'f_persona', rows: 4, placeholder: 'You are a warm, sharp receptionist. Answer in 1 to 2 short spoken sentences, qualify the lead, and book a callback.' }, e.persona || '');
  const greetI = el('input', { class: 'input', id: 'f_greeting', type: 'text', value: e.greeting || '', placeholder: 'Hi, thanks for calling RapidX. How can I help today.', maxlength: 240 });
  const descI = el('input', { class: 'input', id: 'f_desc', type: 'text', value: (tts.description || ''), placeholder: 'Optional voice direction, e.g. calm and confident' });

  const modelSeg = el('div', { class: 'seg', id: 'f_model_seg' }, VOICE_MODELS.map((m) =>
    el('button', { type: 'button', class: m === state.model ? 'on' : '', 'data-m': m, onclick: () => { state.model = m; syncVoice(); } }, m)
  ));
  const speakerSel = el('select', { class: 'select', id: 'f_speaker' }, SPEAKERS.map((s) =>
    el('option', { value: s, selected: s === state.speaker ? 'selected' : false }, s)
  ));
  const f0Val = el('span', { class: 'rv', id: 'f_f0_val' }, String(state.f0));
  const f0Range = el('input', { type: 'range', id: 'f_f0', min: -12, max: 12, step: 1, value: state.f0, oninput: (ev) => { state.f0 = +ev.target.value; f0Val.textContent = (state.f0 > 0 ? '+' : '') + state.f0; } });
  if (state.f0 > 0) f0Val.textContent = '+' + state.f0;

  const didSel = el('select', { class: 'select', id: 'f_did' }, [el('option', { value: '' }, 'No number assigned')]);
  if (e.telephony && e.telephony.did) { /* set after dids load */ setTimeout(() => { try { didSel.value = e.telephony.did; } catch (x) {} }, 0); }

  const speakerField = field('Speaker', speakerSel);
  const descField = field('Voice direction (mulberry)', descI);
  function syncVoice() {
    $$('#f_model_seg button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-m') === state.model));
    const isMul = state.model === 'mulberry';
    speakerField.style.display = isMul ? '' : 'none';
    descField.style.display = isMul ? '' : 'none';
  }

  const submitBtn = el('button', { class: 'btn btn-primary' }, existing ? 'Save changes' : 'Create agent');
  const form = el('form', { onsubmit: onSave }, [
    el('div', { class: 'form-grid' }, [
      field('Agent name', nameI),
      field('Assigned number', didSel),
      (function () { const f = field('Persona', personaI); f.classList.add('full'); return f; })(),
      (function () { const f = field('Greeting', greetI); f.classList.add('full'); return f; })(),
      field('Voice model', modelSeg),
      field('Pitch, f0_up_key', el('div', { class: 'range-row' }, [f0Range, f0Val])),
      speakerField,
      descField
    ]),
    el('div', { class: 'flex gap-2', style: 'margin-top:18px;align-items:center' }, [submitBtn, existing ? el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => modalClose() }, 'Cancel') : null])
  ]);

  card.appendChild(el('h3', {}, existing ? 'Edit agent' : 'New agent'));
  card.appendChild(el('p', { class: 'hint' }, existing ? 'Update the persona, voice, or assigned number.' : 'Describe the persona and pick a voice. You can preview it instantly before assigning a number.'));
  card.appendChild(form);
  syncVoice();

  let _modalClose = null;
  function modalClose() { if (_modalClose) _modalClose(); }
  card._setModalClose = (fn) => { _modalClose = fn; };

  async function onSave(ev) {
    ev.preventDefault();
    const name = nameI.value.trim();
    const persona = personaI.value.trim();
    if (!name) { toast('Give the agent a name.', 'err'); nameI.focus(); return; }
    if (!persona) { toast('Add a persona so the agent knows how to behave.', 'err'); personaI.focus(); return; }
    submitBtn.disabled = true; submitBtn.textContent = existing ? 'Saving...' : 'Creating...';
    const payload = {
      name: name,
      persona: persona,
      greeting: greetI.value.trim(),
      did: didSel.value || '',
      tts: { model: state.model, speaker: state.speaker, f0_up_key: state.f0, description: descI.value.trim() }
    };
    try {
      if (existing) {
        payload.id = existing.id;
        const res = await api('/api/agents/update', { method: 'POST', body: payload });
        const idx = State.agents.findIndex((a) => a.id === existing.id);
        if (idx !== -1) State.agents[idx] = res.agent || Object.assign({}, existing, payload);
        toast('Agent updated.', 'ok');
        modalClose();
      } else {
        const res = await api('/api/agents', { method: 'POST', body: payload });
        if (res.agent) State.agents.push(res.agent);
        toast('Agent created.', 'ok');
        // reset the inline form
        nameI.value = ''; personaI.value = ''; greetI.value = ''; descI.value = ''; didSel.value = '';
      }
      paintAgents();
    } catch (ex) {
      toast(ex.message || 'Could not save agent.', 'err');
    } finally {
      submitBtn.disabled = false; submitBtn.textContent = existing ? 'Save changes' : 'Create agent';
    }
  }

  return card;
}

function paintAgents() {
  const grid = $('#agentsGrid'); if (!grid) return;
  refillDidOptions();
  grid.innerHTML = '';
  if (!State.agents.length) {
    grid.appendChild(el('div', { class: 'empty' }, [
      el('div', { class: 'ttl' }, 'No agents yet'),
      el('div', {}, 'Use the builder above to create your first voice agent.')
    ]));
    return;
  }
  State.agents.forEach((a) => grid.appendChild(agentCard(a)));
}

function agentCard(a) {
  const tts = a.tts || {};
  const voiceLine = (tts.model || 'mulberry') + ' / ' + (tts.speaker || 'speaker') + (tts.f0_up_key ? ' / pitch ' + (tts.f0_up_key > 0 ? '+' : '') + tts.f0_up_key : '');
  const did = a.telephony && a.telephony.did ? a.telephony.did : null;

  const previewBtn = el('button', { class: 'btn btn-ghost btn-sm' }, 'Preview voice');
  previewBtn.addEventListener('click', () => previewAgentVoice(a, previewBtn));

  // textContent everywhere = XSS safe for persona/name
  return el('div', { class: 'card card-glow agent-card' }, [
    el('div', { class: 'ac-top' }, [
      el('div', { class: 'ac-av' }, initials(a.name)),
      el('div', { style: 'min-width:0' }, [
        el('div', { class: 'ac-name' }, a.name),
        el('div', { class: 'ac-voice' }, voiceLine)
      ])
    ]),
    el('div', { class: 'ac-persona' }, a.persona || 'No persona set.'),
    el('div', { class: 'ac-meta' }, [
      did ? el('span', { class: 'tag' }, did) : el('span', { class: 'tag' }, 'no number'),
      el('span', { class: 'tag' }, (tts.model || 'mulberry'))
    ]),
    el('div', { class: 'ac-actions' }, [
      previewBtn,
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => openEditAgent(a) }, 'Edit'),
      el('button', { class: 'btn btn-ghost btn-sm', onclick: () => confirmDeleteAgent(a) }, 'Delete')
    ])
  ]);
}

async function previewAgentVoice(a, btn) {
  const tts = a.tts || {};
  const text = (a.greeting && a.greeting.trim()) || ('Hi, this is ' + (a.name || 'your agent') + '. How can I help today.');
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = 'Synthesizing...';
  try {
    const body = { text: text, model: tts.model || 'mulberry', speaker: tts.speaker, f0_up_key: tts.f0_up_key, description: tts.description };
    const res = await api('/api/tts', { method: 'POST', body: body });
    const buf = await res.arrayBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
    btn.textContent = 'Playing...';
    audio.onended = () => { btn.textContent = old; btn.disabled = false; URL.revokeObjectURL(url); };
  } catch (ex) {
    toast(ex.message || 'Voice preview failed.', 'err');
    btn.textContent = old; btn.disabled = false;
  }
}

function openEditAgent(a) {
  const form = buildAgentForm(a);
  form.style.boxShadow = 'none'; form.style.border = '0'; form.style.background = 'transparent'; form.style.padding = '0';
  const host = $('#modal-host');
  const close = () => { host.classList.add('hide'); host.setAttribute('aria-hidden', 'true'); host.innerHTML = ''; };
  form._setModalClose(() => { close(); paintAgents(); });
  const card = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', style: 'max-width:600px' }, [form]);
  host.innerHTML = '';
  host.appendChild(el('div', { onclick: (ev) => { if (ev.target === ev.currentTarget) close(); }, style: 'position:absolute;inset:0' }));
  host.appendChild(card);
  host.classList.remove('hide');
  host.setAttribute('aria-hidden', 'false');
  setTimeout(refillDidOptions, 0);
}

function confirmDeleteAgent(a) {
  modal({
    title: 'Delete agent',
    body: el('p', {}, ['Delete ', el('b', {}, a.name), '. This cannot be undone.']),
    confirmText: 'Delete agent', confirmKind: 'danger',
    onConfirm: async () => {
      await api('/api/agents/delete', { method: 'POST', body: { id: a.id } });
      State.agents = State.agents.filter((x) => x.id !== a.id);
      paintAgents();
      toast('Agent deleted.', 'ok');
    }
  });
}

/* helper used by builder */
function field(label, input) { return el('div', { class: 'field' }, [el('label', {}, label), input]); }

/* ===========================================================================
   3. VOICE STUDIO
   =========================================================================== */
function viewStudio(root) {
  root.appendChild(viewHead('Voice Studio', 'Type anything, pick a model, and synthesize. See the waveform, hear it back, and watch the cost in real time.'));

  const st = { model: 'mulberry', tone: 'neutral', speaker: 'speaker_2', f0: 0, stream: false };

  const textArea = el('textarea', { class: 'textarea studio-text', id: 's_text', placeholder: 'Welcome to RapidX Voice. Production grade voice agents at roughly one rupee.' }, 'Welcome to RapidX Voice. Production grade voice agents at roughly one rupee.');

  // model picker
  const modelSeg = el('div', { class: 'seg' }, VOICE_MODELS.map((m) =>
    el('button', { type: 'button', class: m === st.model ? 'on' : '', 'data-m': m, onclick: () => { st.model = m; syncCtl(); updateCost(); } }, m)
  ));
  // muga tones
  const toneSeg = el('div', { class: 'seg', id: 's_tones' }, MUGA_TONES.map((tn) =>
    el('button', { type: 'button', class: tn === st.tone ? 'on' : '', 'data-t': tn, onclick: () => { st.tone = tn; $$('#s_tones button').forEach((b) => b.classList.toggle('on', b.getAttribute('data-t') === tn)); } }, tn)
  ));
  // mulberry controls
  const speakerSel = el('select', { class: 'select' }, SPEAKERS.map((s) => el('option', { value: s, selected: s === st.speaker ? 'selected' : false }, s)));
  speakerSel.addEventListener('change', () => { st.speaker = speakerSel.value; });
  const f0Val = el('span', { class: 'rv' }, '0');
  const f0Range = el('input', { type: 'range', min: -12, max: 12, step: 1, value: 0, oninput: (ev) => { st.f0 = +ev.target.value; f0Val.textContent = (st.f0 > 0 ? '+' : '') + st.f0; } });
  const descI = el('input', { class: 'input', placeholder: 'Optional voice direction, e.g. warm and reassuring' });
  descI.addEventListener('input', () => { st.desc = descI.value; });

  const mugaCtl = field('Tone (muga)', toneSeg);
  const mulSpeaker = field('Speaker (mulberry)', speakerSel);
  const mulPitch = field('Pitch, f0_up_key', el('div', { class: 'range-row' }, [f0Range, f0Val]));
  const mulDesc = field('Voice direction (mulberry)', descI);
  function syncCtl() {
    $$('.seg button[data-m]').forEach((b) => b.classList.toggle('on', b.getAttribute('data-m') === st.model));
    const isMul = st.model === 'mulberry';
    mugaCtl.style.display = isMul ? 'none' : '';
    [mulSpeaker, mulPitch, mulDesc].forEach((f) => f.style.display = isMul ? '' : 'none');
  }

  const charsEl = el('span', { class: 'c-chars', id: 's_chars' }, '0 chars');
  const costEl = el('span', { class: 'c-cost', id: 's_cost' }, [document.createTextNode('about '), el('b', {}, '₹0.00')]);
  function updateCost() {
    const len = (textArea.value || '').length;
    const capped = Math.min(len, 2000);
    const cost = capped / 1000 * (RATE[st.model] || RATE.mulberry);
    charsEl.textContent = len + ' chars' + (len > 2000 ? ' (capped at 2000)' : '');
    costEl.innerHTML = '';
    costEl.appendChild(document.createTextNode('about '));
    costEl.appendChild(el('b', {}, '₹' + cost.toFixed(2)));
  }
  textArea.addEventListener('input', updateCost);

  const streamToggle = el('label', { class: 'streamtoggle' }, [
    el('input', { type: 'checkbox', onchange: (ev) => { st.stream = ev.target.checked; } }),
    document.createTextNode('Stream progressively (low latency)')
  ]);

  const synthBtn = el('button', { class: 'btn btn-primary' }, 'Synthesize');
  const audioEl = el('audio', { controls: 'controls', preload: 'none' });
  const waveCanvas = el('canvas', { class: 'wave-canvas', id: 's_wave' });
  const playerRow = el('div', { class: 'player-row', style: 'display:none' }, [audioEl]);

  synthBtn.addEventListener('click', () => doSynthesize(st, textArea, synthBtn, audioEl, waveCanvas, playerRow));

  const main = el('div', { class: 'card studio-main' }, [
    field('Text to speak', textArea),
    el('div', { class: 'wave-wrap' }, [waveCanvas, playerRow]),
    el('div', { class: 'flex items-center gap-2', style: 'flex-wrap:wrap' }, [synthBtn, streamToggle])
  ]);

  const side = el('div', { class: 'studio-side' }, [
    el('div', { class: 'card card-pad' }, [
      el('h3', { class: 't-h3', style: 'margin-bottom:14px' }, 'Voice'),
      field('Model', modelSeg),
      mugaCtl, mulSpeaker, mulPitch, mulDesc
    ]),
    el('div', { class: 'card card-pad' }, [
      el('h3', { class: 't-h3', style: 'margin-bottom:14px' }, 'Economics'),
      el('div', { class: 'cost-readout' }, [charsEl, costEl]),
      el('p', { class: 'muted', style: 'font-size:.8rem;margin-top:10px' }, 'Mulberry promo is about Rs 0.50 per 1000 chars, roughly 20x cheaper than ElevenLabs.')
    ])
  ]);

  root.appendChild(el('div', { class: 'studio-grid' }, [main, side]));
  syncCtl(); updateCost();
  // size the canvas after layout
  setTimeout(() => sizeCanvas(waveCanvas), 30);
  window.addEventListener('resize', () => sizeCanvas(waveCanvas), { once: true });
}

async function doSynthesize(st, textArea, btn, audioEl, canvas, playerRow) {
  const raw = (textArea.value || '').trim();
  if (!raw) { toast('Type something to synthesize.', 'err'); textArea.focus(); return; }
  let text = raw.slice(0, 2000);
  // muga tone is applied as a [tone] prefix
  if (st.model === 'muga' && st.tone && st.tone !== 'neutral') text = '[' + st.tone + '] ' + text;

  const old = btn.textContent; btn.disabled = true; btn.textContent = 'Synthesizing...';

  if (st.stream) {
    try {
      await streamSynthesize(text, st, canvas, btn);
      btn.disabled = false; btn.textContent = old;
      refreshUsageSoft();
      return;
    } catch (ex) {
      toast('Stream failed, falling back to file. ' + (ex.message || ''), 'info');
      // fall through to normal synth
    }
  }

  try {
    const body = { text: text, model: st.model };
    if (st.model === 'mulberry') { body.speaker = st.speaker; body.f0_up_key = st.f0; if (st.desc) body.description = st.desc; }
    const res = await api('/api/tts', { method: 'POST', body: body });
    const chars = res.headers.get('X-Chars');
    const credits = res.headers.get('X-Credits-Used');
    const buf = await res.arrayBuffer();
    const blob = new Blob([buf], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    audioEl.src = url; playerRow.style.display = '';
    drawWaveformFromBuffer(buf.slice(0), canvas);
    audioEl.play().catch(() => {});
    toast('Synthesized ' + (chars || text.length) + ' chars' + (credits ? ', ' + credits + ' credits.' : '.'), 'ok');
    refreshUsageSoft();
  } catch (ex) {
    toast(ex.message || 'Synthesis failed.', 'err');
  } finally {
    btn.disabled = false; btn.textContent = old;
  }
}

function refreshUsageSoft() {
  // invalidate cached usage so Overview reflects new chars next visit
  State.loaded.usage = false; State.usage = null;
}

/* ---- waveform rendering ---- */
function sizeCanvas(canvas) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 560, h = canvas.clientHeight || 90;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // idle baseline
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(110,123,255,0.25)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
}
function drawWaveformFromBuffer(arrbuf, canvas) {
  try {
    const samples = decodeWavPcm(arrbuf);
    if (!samples) { sizeCanvas(canvas); return; }
    drawWaveform(samples, canvas);
  } catch (e) { sizeCanvas(canvas); }
}
function decodeWavPcm(arrbuf) {
  const dv = new DataView(arrbuf);
  if (dv.byteLength < 44) return null;
  // verify RIFF/WAVE
  if (dv.getUint32(0, false) !== 0x52494646) return null; // 'RIFF'
  // walk chunks to find fmt + data
  let off = 12, fmt = null, dataOff = -1, dataLen = 0;
  while (off + 8 <= dv.byteLength) {
    const id = dv.getUint32(off, false);
    const sz = dv.getUint32(off + 4, true);
    if (id === 0x666d7420) { // 'fmt '
      fmt = { format: dv.getUint16(off + 8, true), channels: dv.getUint16(off + 10, true), bits: dv.getUint16(off + 22, true) };
    } else if (id === 0x64617461) { // 'data'
      dataOff = off + 8; dataLen = sz; break;
    }
    off += 8 + sz + (sz & 1);
  }
  if (!fmt || dataOff < 0 || fmt.bits !== 16) return null;
  const n = Math.floor(dataLen / 2);
  const ch = fmt.channels || 1;
  const out = new Float32Array(Math.floor(n / ch));
  let j = 0;
  for (let i = 0; i + ch <= n; i += ch) {
    const s = dv.getInt16(dataOff + i * 2, true);
    out[j++] = s / 32768;
  }
  return out;
}
function drawWaveform(samples, canvas) {
  sizeCanvas(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr, h = canvas.height / dpr;
  ctx.clearRect(0, 0, w, h);
  const bars = Math.max(40, Math.min(180, Math.floor(w / 4)));
  const block = Math.floor(samples.length / bars) || 1;
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#34E7E4'); grad.addColorStop(0.6, '#6E7BFF'); grad.addColorStop(1, '#A855F7');
  ctx.fillStyle = grad;
  const bw = w / bars;
  for (let b = 0; b < bars; b++) {
    let peak = 0;
    for (let k = 0; k < block; k++) { const v = Math.abs(samples[b * block + k] || 0); if (v > peak) peak = v; }
    const bh = Math.max(2, peak * (h * 0.92));
    const x = b * bw, y = (h - bh) / 2;
    const r = Math.min(bw * 0.34, 2);
    roundRect(ctx, x + bw * 0.18, y, bw * 0.64, bh, r);
  }
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath(); ctx.fill();
}

/* ---- streaming TTS (PCM int16 LE 24kHz) via /api/ws-connect then wss Rumik ---- */
async function streamSynthesize(text, st, canvas, btn) {
  const mint = await api('/api/ws-connect', { method: 'POST', body: { text: text, model: st.model } });
  if (!mint.ws_url) throw new ApiError(0, 'No ws_url returned.');
  return new Promise((resolve, reject) => {
    let ws, audioCtx, nextTime = 0, started = false, chunks = [];
    const SR = 24000;
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SR }); } catch (e) { return reject(new ApiError(0, 'No Web Audio.')); }
    const url = mint.ws_url + (mint.token && mint.ws_url.indexOf('token=') === -1 ? (mint.ws_url.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(mint.token) : '');
    try { ws = new WebSocket(url); } catch (e) { return reject(new ApiError(0, 'WebSocket failed.')); }
    ws.binaryType = 'arraybuffer';
    const fail = (m) => { try { ws.close(); } catch (e) {} reject(new ApiError(0, m)); };
    const timeout = setTimeout(() => fail('Stream timed out.'), 20000);
    ws.onopen = () => { try { ws.send(JSON.stringify({ text: text, model: st.model })); } catch (e) {} };
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        try { const m = JSON.parse(ev.data); if (m.type === 'end' || m.done) { clearTimeout(timeout); finish(); } } catch (e) {}
        return;
      }
      const pcm = new Int16Array(ev.data);
      if (!pcm.length) return;
      chunks.push(pcm);
      const f32 = new Float32Array(pcm.length);
      for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768;
      const ab = audioCtx.createBuffer(1, f32.length, SR);
      ab.copyToChannel(f32, 0);
      const src = audioCtx.createBufferSource(); src.buffer = ab; src.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      if (nextTime < now) nextTime = now + 0.04;
      src.start(nextTime); nextTime += ab.duration;
      started = true;
    };
    ws.onclose = () => { clearTimeout(timeout); if (started) finish(); else fail('Stream closed early.'); };
    ws.onerror = () => { clearTimeout(timeout); fail('Stream connection error.'); };
    function finish() {
      // draw the gathered waveform once
      if (chunks.length) {
        let total = 0; chunks.forEach((c) => total += c.length);
        const all = new Float32Array(total); let o = 0;
        chunks.forEach((c) => { for (let i = 0; i < c.length; i++) all[o++] = c[i] / 32768; });
        try { drawWaveform(all, canvas); } catch (e) {}
      }
      try { ws.close(); } catch (e) {}
      resolve();
    }
  });
}

/* ===========================================================================
   4. TALK TO IT
   =========================================================================== */
async function viewTalk(root) {
  root.appendChild(viewHead('Talk to it', 'A live loop. Speak or type, the agent thinks with the brain, then answers in its own voice.'));

  await ensureAgents().catch(() => {});
  if (!State.activeAgentId && State.agents.length) State.activeAgentId = State.agents[0].id;

  const convo = []; // { role:'user'|'bot', text }
  const transcript = el('div', { class: 'transcript', id: 't_transcript' }, [
    el('div', { class: 'bubble sys' }, State.agents.length ? 'Say hello, or type below to start.' : 'Create an agent first, then come back to talk to it.')
  ]);

  const agentSel = el('select', { class: 'select' }, State.agents.length
    ? State.agents.map((a) => el('option', { value: a.id, selected: a.id === State.activeAgentId ? 'selected' : false }, a.name))
    : [el('option', { value: '' }, 'No agents yet')]);
  agentSel.addEventListener('change', () => { State.activeAgentId = agentSel.value; });

  const textIn = el('input', { class: 'input', placeholder: State.agents.length ? 'Type a message...' : 'Create an agent to begin', disabled: State.agents.length ? false : 'disabled' });
  const sendBtn = el('button', { class: 'btn btn-primary' }, 'Send');
  const micBtn = el('button', { class: 'mic-btn', title: 'Hold to talk', 'aria-label': 'Microphone', html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/><path d="M8.5 21h7"/></svg>' });

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const sttMode = SR ? 'webspeech' : 'record';

  function getActiveAgent() { return State.agents.find((a) => a.id === State.activeAgentId) || State.agents[0]; }

  function addBubble(role, text) {
    if ($('.bubble.sys', transcript)) { const s = $('.bubble.sys', transcript); if (convo.length === 0) s.remove(); }
    const b = el('div', { class: 'bubble ' + (role === 'user' ? 'user' : 'bot') }, text); // textContent = XSS safe
    transcript.appendChild(b);
    transcript.scrollTop = transcript.scrollHeight;
    return b;
  }
  function addTyping() {
    const b = el('div', { class: 'bubble bot', html: '<span class="typing"><i></i><i></i><i></i></span>' });
    transcript.appendChild(b); transcript.scrollTop = transcript.scrollHeight; return b;
  }

  async function runTurn(userText) {
    userText = (userText || '').trim();
    if (!userText) return;
    const agent = getActiveAgent();
    if (!agent) { toast('Pick an agent first.', 'err'); return; }
    addBubble('user', userText);
    convo.push({ role: 'user', text: userText });
    textIn.value = '';
    const typing = addTyping();
    try {
      const chat = await api('/api/chat', { method: 'POST', body: { messages: convo.map((m) => ({ role: m.role === 'bot' ? 'model' : 'user', text: m.text })), system: agent.persona } });
      const reply = (chat.text || '').trim() || 'Sorry, I did not catch that.';
      typing.remove();
      addBubble('bot', reply);
      convo.push({ role: 'bot', text: reply });
      // speak it
      speakReply(reply, agent);
    } catch (ex) {
      typing.remove();
      addBubble('bot', 'I hit an error reaching the brain. ' + (ex.message || ''));
      toast(ex.message || 'Chat failed.', 'err');
    }
  }

  async function speakReply(text, agent) {
    const tts = agent.tts || {};
    try {
      const res = await api('/api/tts', { method: 'POST', body: { text: text.slice(0, 2000), model: tts.model || 'mulberry', speaker: tts.speaker, f0_up_key: tts.f0_up_key, description: tts.description } });
      const buf = await res.arrayBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
      const audio = new Audio(url); audio.onended = () => URL.revokeObjectURL(url);
      audio.play().catch(() => URL.revokeObjectURL(url));
    } catch (ex) { /* voice is best effort, transcript already shown */ }
  }

  sendBtn.addEventListener('click', () => runTurn(textIn.value));
  textIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') runTurn(textIn.value); });

  // mic
  let recognizing = false, recognition = null, mediaRec = null, recChunks = [];
  micBtn.addEventListener('click', async () => {
    if (!window.isSecureContext) { toast('Mic needs a secure (HTTPS) connection, your browser blocks it on http. Type your message below to chat for now.', 'err'); return; }
    if (!State.agents.length) { toast('Create an agent first.', 'err'); return; }
    if (sttMode === 'webspeech') {
      if (recognizing) { try { recognition.stop(); } catch (e) {} return; }
      recognition = new SR();
      recognition.lang = 'en-IN'; recognition.interimResults = false; recognition.maxAlternatives = 1;
      recognition.onresult = (ev) => { const txt = ev.results[0][0].transcript; runTurn(txt); };
      recognition.onerror = (ev) => { toast('Mic error: ' + (ev.error || 'unknown') + '. You can type instead.', 'err'); };
      recognition.onend = () => { recognizing = false; micBtn.classList.remove('rec'); };
      try { recognition.start(); recognizing = true; micBtn.classList.add('rec'); toast('Listening...', 'info'); }
      catch (e) { toast('Could not start the mic.', 'err'); }
    } else {
      // record + POST to /api/stt fallback
      if (mediaRec && mediaRec.state === 'recording') { mediaRec.stop(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recChunks = [];
        mediaRec = new MediaRecorder(stream);
        mediaRec.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
        mediaRec.onstop = async () => {
          micBtn.classList.remove('rec');
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(recChunks, { type: mediaRec.mimeType || 'audio/webm' });
          const b64 = await blobToBase64(blob);
          toast('Transcribing...', 'info');
          try {
            const r = await api('/api/stt', { method: 'POST', body: { audio: b64, mime: blob.type } });
            if (r.text) runTurn(r.text); else toast('Could not transcribe that.', 'err');
          } catch (ex) { toast(ex.message || 'Transcription failed.', 'err'); }
        };
        mediaRec.start(); micBtn.classList.add('rec'); toast('Recording, tap again to stop.', 'info');
      } catch (e) { toast('Mic permission denied. You can type instead.', 'err'); }
    }
  });

  const panel = el('div', { class: 'card talk-panel' }, [
    el('div', { class: 'talk-head' }, [
      el('div', { class: 'who' }, [document.createTextNode('Active agent '), el('span', {}, sttMode === 'webspeech' ? '(voice ready)' : '(server transcription)')]),
      agentSel
    ]),
    transcript,
    el('div', { class: 'talk-input' }, [micBtn, textIn, sendBtn])
  ]);

  const side = el('div', { class: 'talk-side' }, [
    el('div', { class: 'card card-pad' }, [
      el('h3', { class: 't-h3' }, 'How it works'),
      el('p', { class: 'soft', style: 'font-size:.88rem' }, 'Your turn goes to the brain with the agent persona as the system prompt. The reply is spoken back in the agent voice.'),
      el('div', { class: 'divider', style: 'margin:6px 0' }),
      el('div', { class: 'soft', style: 'font-size:.84rem' }, sttMode === 'webspeech'
        ? 'Voice input uses your browser speech engine. Tap the mic, speak, and it sends automatically.'
        : 'Your browser has no speech engine, so the mic records and we transcribe on the server. Tap the mic to start and stop.'),
      el('div', { class: 'soft', style: 'font-size:.84rem;margin-top:10px' }, 'No mic. Just type in the box, it works everywhere.')
    ])
  ]);

  root.appendChild(el('div', { class: 'talk-grid' }, [panel, side]));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)); };
    r.onerror = reject; r.readAsDataURL(blob);
  });
}

/* ===========================================================================
   5. TELEPHONY
   =========================================================================== */
async function viewTelephony(root) {
  root.appendChild(viewHead('Telephony', 'Your live numbers, wallet, and call routing. Place outbound calls with an explicit confirmation.'));

  const statusHost = el('div', { class: 'card card-pad', id: 'telStatus' }, skeleton('sk-line', 5));
  const dialHost = el('div', { class: 'card card-pad' }, dialForm());
  root.appendChild(el('div', { class: 'tel-grid' }, [statusHost, dialHost]));

  try {
    const s = await ensureTelephony(true);
    paintTelephony(statusHost, s);
    refreshDialNumbers(s);
  } catch (e) {
    statusHost.innerHTML = '';
    statusHost.appendChild(el('div', { class: 'muted' }, 'Could not reach telephony. ' + esc(e.message)));
  }
}

function paintTelephony(host, s) {
  host.innerHTML = '';
  const wallet = s.wallet || {};
  const bal = wallet.balance != null ? wallet.balance : (s.balance != null ? s.balance : null);
  const cur = wallet.currency || s.currency || 'INR';
  // Telephony is healthy if VoiceLink answered with a wallet or live DIDs. The
  // separate engine-tunnel field may read "not set" without meaning telephony is down.
  const reachable = (bal != null) || (Array.isArray(s.dids) && s.dids.length > 0);
  const engineUp = reachable ? true
    : (s.engine == null ? null
        : (/unreachable|not set/i.test(String(s.engine)) ? false : true));
  const routeList = Array.isArray(s.routing) ? s.routing : (s.engine && Array.isArray(s.engine.routing) ? s.engine.routing : []);
  const routing = routeList.length
    ? routeList.map((r) => (r.did_number || r.did || '?') + ' → ' + (r.outbound_websocket_bot_name || ('bot ' + (r.outbound_websocket_bot_id || '?')))).join(',  ')
    : 'not configured';

  host.appendChild(el('div', { class: 'flex items-center justify-between', style: 'margin-bottom:14px' }, [
    el('h3', { class: 't-h3' }, 'Engine status'),
    el('span', { class: 'pill' }, [el('span', { class: 'dot' + (engineUp === false ? ' bad' : engineUp === null ? ' warn' : '') }), engineUp === false ? 'down' : engineUp === null ? 'unknown' : 'healthy'])
  ]));

  if (bal != null) {
    host.appendChild(el('div', { style: 'margin-bottom:16px' }, [
      el('div', { class: 'muted', style: 'font-size:.8rem' }, 'Wallet balance'),
      el('div', { class: 'wallet-big' }, [document.createTextNode(cur === 'INR' ? '₹' : (cur + ' ')), document.createTextNode(fmtInr(bal)), el('small', {}, ' ' + cur)])
    ]));
  }

  // DIDs
  const didList = s.dids || (s.did ? [{ number: s.did, status: 'active' }] : []);
  if (didList.length) {
    host.appendChild(el('div', { class: 'muted', style: 'font-size:.8rem;margin-bottom:8px' }, 'Numbers'));
    didList.forEach((d) => {
      const num = typeof d === 'string' ? d : (d.did_number || d.number || d.did || '');
      const status = d.user_status_label || d.status || 'active';
      const exp = d.expiry_date || d.expiry || d.expires || d.expiresAt;
      host.appendChild(el('div', { class: 'did-row' }, [
        el('div', {}, [el('div', { class: 'num' }, num), exp ? el('div', { class: 'exp' }, 'Expires ' + exp) : null]),
        el('span', { class: 'pill' }, [el('span', { class: 'dot' + (status !== 'active' ? ' warn' : '') }), status])
      ]));
    });
  }

  host.appendChild(el('div', { class: 'divider', style: 'margin:14px 0' }));
  host.appendChild(el('div', { class: 'status-line' }, [el('span', { class: 'k' }, 'Routing'), el('span', { class: 'v' }, String(routing))]));
  if (s.engine && s.engine.version) host.appendChild(el('div', { class: 'status-line' }, [el('span', { class: 'k' }, 'Engine'), el('span', { class: 'v' }, String(s.engine.version))]));
  if (s.dashboard) host.appendChild(el('div', { class: 'status-line' }, [el('span', { class: 'k' }, 'Dashboard'), el('a', { class: 'v', href: s.dashboard, target: '_blank', rel: 'noopener', style: 'color:var(--accent)' }, 'Open')]));

  host.appendChild(el('div', { class: 'inbound-note' }, 'Inbound: calls to your numbers are answered by the assigned agent through the live engine. Configure routing per number in the dashboard.'));
}

function dialForm() {
  const numI = el('input', { class: 'input', id: 'dial_num', type: 'tel', inputmode: 'numeric', maxlength: 10, placeholder: '9876543210' });
  numI.addEventListener('input', () => { numI.value = numI.value.replace(/\D/g, '').slice(0, 10); });
  const btn = el('button', { class: 'btn btn-primary' }, 'Place call');
  const form = el('form', { class: 'dial-form', onsubmit: (e) => { e.preventDefault(); onDial(numI, btn); } }, [
    el('h3', { class: 't-h3' }, 'Outbound call'),
    el('p', { class: 'muted', style: 'font-size:.85rem' }, 'Enter a 10 digit Indian mobile number. We dial through your live engine.'),
    el('div', { class: 'field' }, [
      el('label', {}, 'Number'),
      el('div', { class: 'dial-input-row' }, [el('span', { class: 'prefix' }, '+91'), numI])
    ]),
    el('div', { class: 'cost-warn' }, ['This places a ', el('b', {}, 'real paid call'), ' at about Rs 0.50 per minute.']),
    btn
  ]);
  return form;
}
function refreshDialNumbers() { /* placeholder for future caller-id selection */ }

function onDial(numI, btn) {
  const num = (numI.value || '').replace(/\D/g, '');
  if (num.length !== 10) { toast('Enter a valid 10 digit mobile number.', 'err'); numI.focus(); return; }
  modal({
    title: 'Confirm a real call',
    body: el('div', {}, [
      el('p', {}, ['You are about to place a real outbound call to ', el('b', {}, '+91 ' + num), '.']),
      el('div', { class: 'danger-note' }, [
        el('b', {}, 'This is a live, paid call. '),
        document.createTextNode('It connects through your telephony engine and bills your wallet at about Rs 0.50 per minute. Only continue if you intend to ring this number now.')
      ])
    ]),
    confirmText: 'Yes, place the call', confirmKind: 'danger',
    onConfirm: async () => {
      btn.disabled = true; btn.textContent = 'Dialing...';
      try {
        const res = await api('/api/telephony/dial', { method: 'POST', body: { number: num, confirm: true } });
        toast('Call placed to +91 ' + num + '.', 'ok');
        State.loaded.telephony = false; // refresh wallet next view
      } catch (ex) {
        if (ex.status === 400 && ex.data && ex.data.error === 'needs_confirm') toast('Confirmation required. Please retry.', 'err');
        else toast(ex.message || 'Dial failed.', 'err');
        throw ex;
      } finally {
        btn.disabled = false; btn.textContent = 'Place call';
      }
    }
  });
}

/* ===========================================================================
   6. SETTINGS
   =========================================================================== */
async function viewSettings(root) {
  root.appendChild(viewHead('Settings', 'Active and ready-to-wire providers, plus your tenant identity. Swap any layer without touching the rest.'));

  const provHost = el('div', { id: 'provHost' }, skeleton('sk-card', 3));
  root.appendChild(provHost);

  const t = State.me.tenant;
  const nameI = el('input', { class: 'input', id: 'set_name', type: 'text', value: t.name || '' });
  const colorVal = (t.branding && t.branding.color) || '#6E7BFF';
  const colorI = el('input', { type: 'color', id: 'set_color', value: colorVal });
  const colorHex = el('input', { class: 'input', id: 'set_color_hex', value: colorVal, style: 'max-width:130px;font-family:var(--mono)' });
  colorI.addEventListener('input', () => { colorHex.value = colorI.value; });
  colorHex.addEventListener('input', () => { if (/^#[0-9a-fA-F]{6}$/.test(colorHex.value)) colorI.value = colorHex.value; });

  const saveBtn = el('button', { class: 'btn btn-primary' }, 'Save tenant settings');
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true; saveBtn.textContent = 'Saving...';
    try {
      // tenant settings update is best effort. If the route is absent, surface a soft note.
      await api('/api/tenant/update', { method: 'POST', body: { name: nameI.value.trim(), color: colorI.value } });
      State.me.tenant.name = nameI.value.trim();
      State.me.tenant.branding = Object.assign({}, State.me.tenant.branding, { color: colorI.value });
      const tn = $('.tenant-chip .tn'); if (tn) { tn.textContent = State.me.tenant.name; tn.title = State.me.tenant.name; }
      const av = $('.tenant-chip .av'); if (av) av.textContent = initials(State.me.tenant.name);
      toast('Tenant settings saved.', 'ok');
    } catch (ex) {
      toast(ex.status === 404 ? 'Tenant settings endpoint not available in this build.' : (ex.message || 'Save failed.'), 'err');
    } finally {
      saveBtn.disabled = false; saveBtn.textContent = 'Save tenant settings';
    }
  });

  root.appendChild(el('div', { class: 'card card-pad', style: 'margin-top:8px' }, [
    el('h3', { class: 't-h3', style: 'margin-bottom:16px' }, 'Tenant'),
    el('div', { class: 'settings-form' }, [
      field('Tenant name', nameI),
      el('div', { class: 'field' }, [el('label', {}, 'Brand color'), el('div', { class: 'color-row' }, [colorI, colorHex])]),
      el('div', { class: 'flex gap-2', style: 'margin-top:6px' }, [saveBtn, el('button', { class: 'btn btn-ghost', onclick: doLogout }, 'Sign out')])
    ])
  ]));

  try {
    const reg = await ensureProviders();
    paintProviders(provHost, reg);
  } catch (e) {
    provHost.innerHTML = '';
    provHost.appendChild(el('div', { class: 'card card-pad muted' }, 'Could not load providers. ' + esc(e.message)));
  }
}

function paintProviders(host, reg) {
  host.innerHTML = '';
  const layers = [
    { key: 'tts', label: 'Text to speech' },
    { key: 'llm', label: 'Brain, LLM' },
    { key: 'telephony', label: 'Telephony' }
  ];
  layers.forEach((L) => {
    const list = reg[L.key] || [];
    const wrap = el('div', { class: 'prov-layer' }, [
      el('div', { class: 'lh' }, [el('span', { class: 'lt' }, L.label)]),
      el('div', { class: 'prov-grid' }, list.length ? list.map(provCard) : [el('div', { class: 'muted' }, 'No providers registered.')])
    ]);
    host.appendChild(wrap);
  });
}
function provCard(p) {
  const live = !!p.live;
  const needs = p.needs || [];
  return el('div', { class: 'card prov-card' }, [
    el('div', { class: 'pc-top' }, [
      el('div', { class: 'pc-name' }, p.label || p.id),
      live
        ? el('span', { class: 'badge-live' }, [el('span', { class: 'd' }), 'Live'])
        : el('span', { class: 'badge-ready' }, [el('span', { class: 'd' }), 'Ready'])
    ]),
    live
      ? el('div', { class: 'pc-needs' }, 'Active and serving requests.')
      : el('div', { class: 'pc-needs' }, needs.length
          ? ['To enable, add ', ...needs.flatMap((n, i) => i ? [document.createTextNode(', '), el('code', {}, n)] : [el('code', {}, n)]), document.createTextNode(' to your .env.')]
          : 'Ready to wire.')
  ]);
}

/* ===========================================================================
   START
   =========================================================================== */
let _booted = false;
function bootOnce() { if (_booted) return; _booted = true; boot(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootOnce);
else bootOnce();
