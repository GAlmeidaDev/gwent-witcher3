import { initI18n, t, name } from './i18n.js';
import { tileTemplate } from './tiles.js';

const q = new URLSearchParams(location.search);
const REGIONS = ['velen', 'skellige', 'toussaint', 'white_orchard', 'kaer_morhen'];
const SIMPLE_CRS = new Set(['velen', 'hos_velen', 'toussaint', 'kaer_morhen']); // como no witcher3map.com
const region = REGIONS.includes(q.get('r')) ? q.get('r') : 'velen';
const sign = q.has('sn') ? { name: q.get('sn'), lat: +q.get('sla'), lng: +q.get('slo') } : null;
const target = q.has('lat') ? { lat: +q.get('lat'), lng: +q.get('lng'), name: q.get('n') ?? '', exact: q.get('e') !== '0' } : null;

await initI18n();
document.title = `${t('ui.map.title')} · The Witcher 3`;
document.getElementById('title').textContent = t('ui.map.title');
document.getElementById('back').textContent = `← ${t('ui.map.back')}`;
document.getElementById('regions').replaceChildren(...REGIONS.map((r) => {
  const a = document.createElement('a');
  a.href = `?r=${r}`; a.textContent = t(`ui.map.regionNames.${r}`);
  if (r === region) a.setAttribute('aria-current', 'page');
  return a;
}));

const all = await fetch('data/map-points.json').then((r) => r.json());
const data = all[region];
const simple = SIMPLE_CRS.has(region);
const bounds = L.latLngBounds(data.bounds[0], data.bounds[1]);

const map = L.map('map', {
  minZoom: 2, maxZoom: data.maxZoom, center: data.center, zoom: 3, attributionControl: false,
  ...(simple ? { crs: L.CRS.Simple } : {}),
});
map.setMaxBounds(bounds);
L.tileLayer(await tileTemplate(region), { tms: true, bounds, noWrap: true, ...(simple ? { continuousWorld: true, crs: L.CRS.Simple } : {}) }).addTo(map);

for (const g of data.gwent) {
  L.circleMarker([g.lat, g.lng], { radius: 5, color: '#201606', weight: 1.5, fillColor: '#d4a84b', fillOpacity: 1 })
    .bindPopup(g.role ?? t('ui.map.gwentPlayer')).addTo(map);
}

const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FLAG = '<svg viewBox="0 0 32 40" width="32" height="40"><path d="M6 2v36" stroke="#2a1f14" stroke-width="3.5" stroke-linecap="round"/><path d="M6 3h20l-5 7 5 7H6z" fill="#e0302c" stroke="#fff4d6" stroke-width="1.6" stroke-linejoin="round"/></svg>';

if (target) {
  if (sign) {
    L.marker([sign.lat, sign.lng], {
      icon: L.divIcon({ className: 'sign', html: `<i></i><span>${esc(name(sign.name))}</span>`, iconSize: [0, 0] }), zIndexOffset: 500,
    }).addTo(map);
  }
  const title = target.name ? name(target.name) : t('ui.map.target');
  const popup = `<strong>${esc(title)}</strong>${sign ? `<br>${esc(t('ui.map.signpost'))}: ${esc(name(sign.name))}` : ''}`;
  const icon = L.divIcon({ className: `flag${target.exact ? '' : ' approx'}`, html: FLAG, iconSize: [32, 40], iconAnchor: [6, 38], popupAnchor: [10, -34] });
  L.marker([target.lat, target.lng], { icon, zIndexOffset: 1000 }).bindPopup(popup).addTo(map).openPopup();
  map.setView([target.lat, target.lng], data.maxZoom - 1);
  if (!target.exact) {
    const note = document.getElementById('note');
    note.textContent = t('ui.map.approxNote'); note.hidden = false;
  }
} else {
  map.setView(data.center, 3);
}
