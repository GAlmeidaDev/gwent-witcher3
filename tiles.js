// Onde ficam os tiles do mapa (WebP): APP_CONFIG.mapsBase ('.' = mesma pasta do site no GitHub Pages).
export async function tileTemplate(region) {
  const base = (window.APP_CONFIG?.mapsBase ?? '.').replace(/\/$/, '');
  return `${base}/${region}/{z}/{x}/{y}.webp`;
}
