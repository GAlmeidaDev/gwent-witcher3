import { tileTemplate } from './tiles.js';
import { initI18n, setLang, getLang, languages, t, name, ability, source, deckName, typeName, dlcName, applyStatic } from './i18n.js';
import * as backend from './backend.js';
import { openScanner, initScanner } from './scan.js';

const $ = (id) => document.getElementById(id);
const DECKS = ['Monsters', 'Nilfgaard', 'Northern', 'Scoiatael', 'Skellige', 'Neutral'];
const DLCS = ['Base', 'Hearts of Stone', 'Blood and Wine'];
const STATUSES = ['', 'missing', 'done'];

let cards = [], done = new Set(), user = null;
const filters = { q: '', deck: '', dlc: '', status: '' };
const tiles = new Map();   // card.id -> elemento (reaproveitado para não recarregar imagens)
let haystack = new Map();  // card.id -> texto normalizado e traduzido para busca

const errText = (e) => {
  const key = `ui.errors.${e.code}`;
  return t(key) === key ? t('ui.errors.generic') : t(key);
};

function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toast.id); toast.id = setTimeout(() => el.classList.remove('show'), 3500);
}

/* ---------- auth ---------- */
let recovering = false; // abriu o link de "esqueci a senha" do e-mail

async function boot() {
  await initI18n();
  buildLangSelects();
  applyStatic();
  const showReset = () => { recovering = true; showAuthForm('reset-form'); $('auth').hidden = false; $('app').hidden = true; buildAuthBg(); };
  backend.onPasswordRecovery(showReset);
  user = await backend.currentUser().catch(() => null);
  if (backend.isRecovery()) showReset();           // veio do link do e-mail: pede a nova senha em vez de entrar direto
  else if (user) await enter();
  else { buildAuthBg(); setMode('login'); $('auth').hidden = false; }
}

/** Fundo do login: mapa de Velen em zoom baixo, escurecido por CSS. */
async function buildAuthBg() {
  const bg = document.querySelector('.auth-bg');
  if (bg.firstChild) return;
  const tpl = await tileTemplate('velen');
  if (bg.firstChild) return;
  const mosaic = document.createElement('div');
  mosaic.className = 'mosaic';
  for (let y = 3; y >= 0; y--) for (let x = 0; x < 3; x++) { // colunas 0–2: a coluna 3 não tem todos os tiles
    const img = new Image();
    img.alt = ''; img.src = tpl.replace('{z}', 2).replace('{x}', x).replace('{y}', y); img.onerror = () => { img.style.visibility = 'hidden'; };
    mosaic.append(img);
  }
  bg.append(mosaic);
}

// Posição na lista (filtros, rolagem, carta aberta): guardada ao sair para o mapa e refeita na volta.
const STATE_KEY = 'gwent-view';
const saveView = () => {
  const v = JSON.stringify({ filters, y: scrollY, card: $('modal').open ? current?.id : null, at: Date.now() });
  try { sessionStorage.setItem(STATE_KEY, v); } catch {}
  try { localStorage.setItem(STATE_KEY, v); } catch {} // vale também se o link abrir em outra aba
};
const read = (store) => { try { return JSON.parse(store.getItem(STATE_KEY)); } catch { return null; } };
const loadView = () => {
  const s = read(sessionStorage);
  if (s) return s;
  const l = read(localStorage);
  return l && Date.now() - l.at < 2 * 3600 * 1000 ? l : null;
};
const clearView = () => { try { sessionStorage.removeItem(STATE_KEY); localStorage.removeItem(STATE_KEY); } catch {} };
addEventListener('pagehide', () => { if (!$('app').hidden) saveView(); });

async function enter() {
  [cards, done] = await Promise.all([fetch('data/cards.json').then((r) => r.json()), backend.loadProgress()]);
  $('username').textContent = user.name;
  $('auth').hidden = true; $('app').hidden = false;
  const view = loadView();
  if (view) { Object.assign(filters, view.filters); $('q').value = filters.q ?? ''; }
  retranslate();
  if (view) {
    scrollTo(0, view.y ?? 0);
    requestAnimationFrame(() => scrollTo(0, view.y ?? 0));
    const c = view.card && cards.find((x) => x.id === view.card);
    if (c) openModal(c);
  }
}

let mode = 'login'; // 'login' | 'register'
function setMode(m) {
  mode = m;
  $('username-field').hidden = m !== 'register';
  $('auth-form').querySelector('[name=password]').autocomplete = m === 'register' ? 'new-password' : 'current-password';
  $('auth-submit').textContent = t(m === 'register' ? 'ui.auth.createAccount' : 'ui.auth.signIn');
  $('register').textContent = t(m === 'register' ? 'ui.auth.haveAccount' : 'ui.auth.createAccount');
  $('auth-error').textContent = ''; $('auth-info').hidden = true;
}
$('register').addEventListener('click', () => setMode(mode === 'login' ? 'register' : 'login'));
$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('auth-error').textContent = ''; $('auth-info').hidden = true;
  const f = Object.fromEntries(new FormData(e.target));
  try {
    if (mode === 'login') user = await backend.signIn(f.email.trim(), f.password);
    else {
      user = await backend.signUp(f.email.trim(), f.password, f.username.trim());
      if (!user) { $('auth-info').hidden = false; return; } // precisa confirmar o e-mail
    }
    await enter();
  } catch (err) { $('auth-error').textContent = errText(err); }
});

/* ---------- esqueci minha senha (link por e-mail) ---------- */
const showAuthForm = (id) => { for (const f of ['auth-form', 'forgot-form', 'reset-form']) $(f).hidden = f !== id; };
$('forgot').onclick = () => { $('forgot-error').textContent = ''; $('forgot-ok').hidden = true; showAuthForm('forgot-form'); };
$('forgot-back').onclick = () => showAuthForm('auth-form');
$('forgot-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('forgot-error').textContent = ''; $('forgot-ok').hidden = true;
  try {
    await backend.sendReset(new FormData(e.target).get('email').trim());
    $('forgot-ok').hidden = false;
  } catch (err) { $('forgot-error').textContent = errText(err); }
});
$('reset-back').onclick = async () => { recovering = false; backend.endRecovery(); history.replaceState(null, '', location.pathname); await backend.signOut().catch(() => {}); showAuthForm('auth-form'); };
$('reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('reset-error').textContent = '';
  try {
    user = await backend.updatePassword(new FormData(e.target).get('password'));
    recovering = false; backend.endRecovery();
    history.replaceState(null, '', location.pathname); // tira o token da barra de endereço
    await enter();
  } catch (err) { $('reset-error').textContent = errText(err); }
});

$('logout').addEventListener('click', async () => { clearView(); await backend.signOut().catch(() => {}); location.reload(); });

/* ---------- idioma ---------- */
function buildLangSelects() {
  document.querySelectorAll('select.lang').forEach((sel) => {
    sel.replaceChildren(...languages().map((l) => new Option(`${l.flag ?? ''} ${l.name}`.trim(), l.code, false, l.code === getLang())));
    sel.onchange = async () => { await setLang(sel.value); buildLangSelects(); applyStatic(); setMode(mode); retranslate(); };
  });
}

/** Reconstrói tudo que depende do idioma (filtros, textos dos cartões, índice de busca). */
function retranslate() {
  if (!cards.length) return;
  $('dlc').replaceChildren(new Option(t('ui.filters.allContent'), ''), ...DLCS.map((d) => new Option(dlcName(d), d)));
  $('dlc').value = filters.dlc;
  $('status').replaceChildren(...STATUSES.map((s) => {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.v = s; b.textContent = t(`ui.filters.status${s ? s[0].toUpperCase() + s.slice(1) : 'All'}`);
    b.onclick = () => { filters.status = s; render(); };
    return b;
  }));
  tiles.clear();
  haystack = new Map(cards.map((c) => [c.id, norm([name(c.name), deckName(c.deck), ...c.sources.map(source), ...c.abilities.map(ability)].join(' '))]));
  render();
}

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* ---------- lista ---------- */
function renderTabs() {
  const tab = (key, label, d, total) => {
    const b = document.createElement('button');
    b.type = 'button'; b.role = 'tab'; b.className = 'tab'; b.dataset.v = key; b.disabled = !total;
    b.setAttribute('aria-selected', filters.deck === key);
    b.innerHTML = `<span></span><small></small>`;
    b.firstChild.textContent = label;
    b.querySelector('small').textContent = `${d}/${total}`;
    b.onclick = () => { filters.deck = key; render(); };
    return b;
  };
  const count = (list) => list.filter((c) => done.has(c.id)).length;
  const scoped = cards.filter((c) => !filters.dlc || c.dlc === filters.dlc);
  $('decks').replaceChildren(
    tab('', t('ui.filters.allDecks'), count(scoped), scoped.length),
    ...DECKS.map((d) => { const l = scoped.filter((c) => c.deck === d); return tab(d, deckName(d), count(l), l.length); }));
}

function render() {
  if (filters.deck && !cards.some((c) => c.deck === filters.deck && (!filters.dlc || c.dlc === filters.dlc))) filters.deck = '';
  const q = norm(filters.q.trim());
  const list = cards.filter((c) =>
    (!filters.deck || c.deck === filters.deck) && (!filters.dlc || c.dlc === filters.dlc) &&
    (!filters.status || (filters.status === 'done') === done.has(c.id)) &&
    (!q || haystack.get(c.id).includes(q)));
  list.sort((a, b) => name(a.name).localeCompare(name(b.name), getLang()));

  const pct = Math.round((done.size / cards.length) * 100);
  $('count').textContent = t('ui.header.collected', { done: done.size, total: cards.length });
  $('meter-fg').style.width = `${pct}%`;
  $('meter').setAttribute('aria-valuenow', pct);
  $('meter').setAttribute('aria-label', t('ui.header.percent', { percent: pct }));
  $('showing').textContent = t('ui.filters.showing', { count: list.length });
  $('status').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === filters.status));
  renderTabs();
  $('grid').replaceChildren(...list.map(tile));
  $('empty').hidden = list.length > 0;
}

function clearFilters() {
  Object.assign(filters, { q: '', deck: '', dlc: '', status: '' });
  $('q').value = ''; $('dlc').value = '';
  render();
}

function tile(c) {
  let el = tiles.get(c.id);
  if (!el) { el = buildTile(c); tiles.set(c.id, el); }
  el.classList.toggle('done', done.has(c.id));
  const btn = el.querySelector('.tick');
  btn.setAttribute('aria-pressed', done.has(c.id));
  btn.setAttribute('aria-label', `${t('ui.card.markCollected')}: ${name(c.name)}`);
  return el;
}

function buildTile(c) {
  const el = document.createElement('article');
  el.className = 'card';
  el.innerHTML = `
    <div class="art">
      <img loading="lazy" referrerpolicy="no-referrer" alt="">
      <span class="fallback" hidden></span>
      <button type="button" class="tick"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
      <button type="button" class="open"></button>
    </div>
    <div class="info"><h2></h2><p class="meta"></p><p class="loc"></p></div>`;
  const img = el.querySelector('img');
  img.src = c.images[0];
  img.alt = name(c.name);
  img.onerror = () => { img.hidden = true; const f = el.querySelector('.fallback'); f.hidden = false; f.textContent = name(c.name); };
  el.querySelector('h2').textContent = name(c.name);
  el.querySelector('.meta').textContent = metaText(c);
  const loc = el.querySelector('.loc');
  loc.textContent = c.sources.length ? source(c.sources[0]) : t('ui.card.noLocation');
  if (c.sources.length) loc.append(...mapAnchors(c.sources[0]));
  const open = el.querySelector('.open');
  open.setAttribute('aria-label', `${t('ui.card.viewDetails')}: ${name(c.name)}`);
  open.onclick = () => openModal(c);
  el.querySelector('.tick').onclick = () => toggle(c);
  return el;
}

const MAP_REGION = { novigrad: 'velen', velen: 'velen', skellige: 'skellige', toussaint: 'toussaint', 'white-orchard': 'white_orchard', 'kaer-morhen': 'kaer_morhen' };

function mapAnchors(src) {
  const link = (href, text, title) => {
    const a = document.createElement('a');
    a.className = 'maplink'; a.href = href;
    a.addEventListener('click', saveView);
    a.title = title; a.textContent = text;
    return a;
  };
  // ponto exato (ou aproximado) no mapa local; sem ponto, abre só a região
  if (src.points?.length) {
    return src.points.map((p) => {
      const qs = new URLSearchParams({ r: p.r, lat: p.lat, lng: p.lng, n: p.name ?? '', e: p.exact ? '1' : '0' });
      if (p.sign) { qs.set('sn', p.sign.name); qs.set('sla', p.sign.lat); qs.set('slo', p.sign.lng); }
      const region = t(`ui.map.regionNames.${p.r}`);
      const sign = p.sign ? ` · ${t('ui.map.signpost')}: ${name(p.sign.name)}` : '';
      return link(`map.html?${qs}`, `🚩 ${region}${sign}${p.exact ? '' : ` (${t('ui.map.approx')})`}`, t('ui.card.openMap'));
    });
  }
  return (src.regions ?? []).map((r) => {
    const m = MAP_REGION[r];
    return link(`map.html?r=${m}`, `📍 ${t(`ui.map.regionNames.${m}`)}`, t('ui.card.openMap'));
  });
}

const metaText = (c) => [deckName(c.deck), typeName(c.type), c.strength && t('ui.card.strength', { value: c.strength }), c.dlc !== 'Base' && dlcName(c.dlc)].filter(Boolean).join(' · ');

async function toggle(c) {
  const on = !done.has(c.id);
  on ? done.add(c.id) : done.delete(c.id);
  render(); if ($('modal').open) updateModalToggle(c);
  try { await backend.setCollected(c.id, on); }
  catch (e) {
    on ? done.delete(c.id) : done.add(c.id);
    render(); if ($('modal').open) updateModalToggle(c);
    toast(e.code === 'unauthenticated' ? errText(e) : t('ui.errors.saveFailed'));
  }
}

/* ---------- scanner ---------- */
initScanner();
$('scan-open').onclick = () => openScanner({
  cards,
  nameOf: (c) => name(c.name),
  isDone: (id) => done.has(id),
  onMark: (c) => (done.has(c.id) ? null : toggle(c)),
  labels: Object.fromEntries(['aim', 'reading', 'found', 'none', 'noCamera', 'error', 'mark', 'already'].map((k) => [k, t(`ui.scan.${k}`)])),
});

/* ---------- detalhes ---------- */
let current = null;
function openModal(c) {
  current = c;
  const setImg = (i) => { $('m-img').src = c.images[i]; [...$('m-vers').children].forEach((b, j) => b.classList.toggle('on', i === j)); };
  $('m-img').alt = name(c.name);
  $('m-vers').replaceChildren(...(c.images.length > 1 ? c.images.map((_, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = t('ui.card.version', { n: i + 1 }); b.onclick = () => setImg(i); return b;
  }) : []));
  setImg(0);
  $('m-name').textContent = name(c.name);
  $('m-meta').textContent = metaText(c);
  $('m-src').replaceChildren(...(c.sources.length ? c.sources : [null]).map((src) => {
    const li = document.createElement('li');
    li.textContent = src ? source(src) : t('ui.card.noLocation');
    if (src) li.append(...mapAnchors(src));
    return li;
  }));
  $('m-ab').replaceChildren(...c.abilities.map((a) => Object.assign(document.createElement('li'), { textContent: ability(a) })));
  $('m-ab-wrap').hidden = !c.abilities.length;
  $('m-quote').textContent = c.quote ? `“${c.quote}”` : '';
  $('modal-close').setAttribute('aria-label', t('ui.card.close'));
  updateModalToggle(c);
  $('modal').showModal();
}
function updateModalToggle(c) {
  const on = done.has(c.id);
  $('m-toggle').textContent = on ? `✓ ${t('ui.card.collected')}` : t('ui.card.markCollected');
  $('m-toggle').classList.toggle('on', on);
}
$('m-toggle').onclick = () => toggle(current);
$('modal-close').onclick = () => $('modal').close();
$('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').close(); });

$('clear').onclick = clearFilters;
$('q').addEventListener('input', (e) => { filters.q = e.target.value; render(); });
$('dlc').addEventListener('change', (e) => { filters.dlc = e.target.value; render(); });

boot();
