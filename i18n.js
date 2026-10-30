// Internacionalização: carrega public/locales/<codigo>.json; en é o fallback.
// Para adicionar um idioma: crie locales/<codigo>.json e liste em locales/index.json.
const FALLBACK = 'en';
const DEFAULT = 'pt-BR';
let loc = {}, base = {}, lang = DEFAULT, available = [];

const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
const fmt = (s, vars = {}) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);

export const getLang = () => lang;
export const languages = () => available;

export async function initI18n() {
  available = await fetch('locales/index.json').then((r) => r.json());
  let saved = null;
  try { saved = localStorage.getItem('lang'); } catch {}
  const nav = (navigator.languages ?? [navigator.language]).find((l) => available.some((a) => a.code === l || a.code.split('-')[0] === l.split('-')[0]));
  const guess = available.find((a) => a.code === nav)?.code ?? available.find((a) => a.code.split('-')[0] === nav?.split('-')[0])?.code;
  await setLang(available.some((a) => a.code === saved) ? saved : guess ?? DEFAULT, false);
}

export async function setLang(code, persist = true) {
  const load = (c) => fetch(`locales/${c}.json`).then((r) => r.json());
  [base, loc] = await Promise.all([load(FALLBACK), code === FALLBACK ? null : load(code)]);
  loc ??= base;
  lang = code;
  document.documentElement.lang = code;
  if (persist) try { localStorage.setItem('lang', code); } catch {}
}

/** Texto da interface: idioma atual → inglês → a própria chave. */
export const t = (key, vars) => fmt(get(loc, key) ?? get(base, key) ?? key, vars);

/** Dicionário de conteúdo do jogo (nomes, habilidades…): cai no texto original se não houver tradução. */
const dict = (section, text) => loc[section]?.[text] ?? base[section]?.[text] ?? text;
export const name = (text) => dict('names', text);
export const ability = (text) => dict('abilities', text);
export const deckName = (k) => t(`decks.${k}`);
export const typeName = (k) => t(`types.${k}`);
export const rowName = (k) => t(`rows.${k}`);
export const dlcName = (k) => t(`dlc.${k}`);

const list = (items) => new Intl.ListFormat(lang, { type: 'disjunction' }).format(items);

function target(tg) {
  const role = tg.role ? t(`roles.${tg.role}`) : null;
  if (role && tg.place) return t('src.role_place', { role, place: name(tg.place) });
  if (tg.who && tg.place) return t('src.who_place', { who: name(tg.who), place: name(tg.place) });
  return tg.who ? name(tg.who) : role ?? '';
}

/** Converte uma origem estruturada (data/cards.json) em frase no idioma atual. */
export function source(s) {
  const prefix = s.count > 1 ? t('src.countPrefix', { count: s.count }) : '';
  const tg = s.targets && list(s.targets.map(target));
  const quest = s.quests && list(s.quests.map(name));
  switch (s.kind) {
    case 'purchase': return prefix + t('src.purchase', { target: tg });
    case 'won': return prefix + (tg && quest ? t('src.won_in_quest', { target: tg, quest }) : tg ? t('src.won', { target: tg }) : t('src.won_quest', { quest }));
    case 'transformed': return t('src.transformed', { card: name(s.card) });
    case 'raw': return prefix + (loc.rawSources?.[s.text] ?? base.rawSources?.[s.text] ?? s.text);
    default: return prefix + t(`src.${s.kind}`, { quest });
  }
}

const MAP_BASE = 'https://wand.com/maps/the-witcher-3/';
/** Links do mapa interativo (um por região) para uma origem. Suporta marcador exato quando `s.marker` existir. */
export function mapLinks(s) {
  return (s.regions ?? []).map((r) => ({ label: t(`regions.${r}`), url: MAP_BASE + r }));
}

/** Aplica traduções aos elementos com data-i18n / data-i18n-placeholder. */
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
}
