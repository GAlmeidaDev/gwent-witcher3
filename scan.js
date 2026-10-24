// Scanner: lê o nome da carta pela câmera (ou de uma imagem) e sugere cartas do checklist.
const $ = (id) => document.getElementById(id);
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function lev(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}
const similarity = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length);

let worker = null;
let stream = null;
let timer = 0;
let busy = false;
let index = [];
let opts = null;

function loadScript(src) {
  return new Promise((ok, fail) => {
    if (window.Tesseract) return ok();
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => fail(new Error('tesseract'));
    document.head.append(s);
  });
}

async function getWorker() {
  if (worker) return worker;
  await loadScript('vendor/tesseract/tesseract.min.js');
  worker = await window.Tesseract.createWorker('eng', 1, {
    workerPath: 'vendor/tesseract/worker.min.js',
    corePath: 'vendor/tesseract',
    langPath: 'vendor/tesseract',
    gzip: true,
  });
  await worker.setParameters({ tessedit_pageseg_mode: '6' });
  return worker;
}

// Compara janelas de palavras vizinhas com cada nome de carta; devolve as 3 melhores.
function match(lines) {
  const hits = new Map();
  for (const words of lines) {
    for (const e of index) {
      const k = e.key.split(' ').length;
      for (const size of new Set([k - 1, k, k + 1])) {
        if (size < 1 || size > words.length) continue;
        for (let i = 0; i + size <= words.length; i++) {
          const s = similarity(words.slice(i, i + size).join(' '), e.key);
          const need = e.key.length < 6 ? 0.99 : e.key.length < 9 ? 0.85 : 0.78;
          if (s >= need && s > (hits.get(e.card.id)?.score ?? 0)) hits.set(e.card.id, { card: e.card, score: s });
        }
      }
    }
  }
  return [...hits.values()].sort((a, b) => b.score - a.score).slice(0, 3);
}

const linesOf = (data) => (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
  .map((l) => l.words.map((w) => norm(w.text)).filter(Boolean)).filter((w) => w.length);

// Recorta a faixa do nome, amplia e aumenta o contraste antes do OCR.
function prepare(source, w, h, box) {
  const sx = box.x * w, sy = box.y * h, sw = box.w * w, sh = box.h * h;
  const scale = Math.min(3, Math.max(1, 1200 / sw));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(source, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const px = g.getImageData(0, 0, c.width, c.height), d = px.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) { const y = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; d[i] = y; lo = Math.min(lo, y); hi = Math.max(hi, y); }
  const k = 255 / Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, (d[i] - lo) * k)); d[i] = d[i + 1] = d[i + 2] = v; }
  g.putImageData(px, 0, 0);
  return c;
}

function showMatches(list) {
  $('scan-results').replaceChildren(...list.map(({ card, score }) => {
    const done = opts.isDone(card.id);
    const li = document.createElement('li');
    li.innerHTML = '<img alt=""><span class="n"></span><span class="p"></span><button type="button" class="btn"></button>';
    li.querySelector('img').src = card.images?.[0] ?? '';
    li.querySelector('.n').textContent = opts.nameOf(card);
    li.querySelector('.p').textContent = `${Math.round(score * 100)}%`;
    const b = li.querySelector('button');
    b.textContent = done ? opts.labels.already : opts.labels.mark;
    b.disabled = done;
    b.onclick = async () => { b.disabled = true; await opts.onMark(card); b.textContent = opts.labels.already; };
    return li;
  }));
}

// Faixa onde o nome da carta deve ficar (a mesma desenhada na moldura da câmera).
const GUIDE = { x: 0.12, y: 0.35, w: 0.76, h: 0.3 };

async function recognize(source, w, h, box = GUIDE) {
  if (busy) return;
  busy = true;
  try {
    const wk = await getWorker();
    $('scan-status').textContent = opts.labels.reading;
    const { data } = await wk.recognize(prepare(source, w, h, box), {}, { text: true, blocks: true });
    const found = match(linesOf(data));
    showMatches(found);
    $('scan-status').textContent = found.length ? opts.labels.found : opts.labels.none;
  } catch (e) {
    $('scan-status').textContent = opts.labels.error;
  } finally { busy = false; }
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false });
    const v = $('scan-video');
    v.srcObject = stream; await v.play();
    $('scan-view').classList.add('live');
    $('scan-status').textContent = opts.labels.aim;
    timer = setInterval(() => { if (v.videoWidth && !busy) recognize(v, v.videoWidth, v.videoHeight); }, 1200);
    getWorker().catch(() => {});
  } catch {
    $('scan-status').textContent = opts.labels.noCamera;
  }
}

function stopCamera() {
  clearInterval(timer); timer = 0;
  stream?.getTracks().forEach((t) => t.stop()); stream = null;
  $('scan-video').srcObject = null;
  $('scan-view').classList.remove('live');
}

export function openScanner(options) {
  opts = options;
  index = [];
  for (const c of opts.cards) for (const n of new Set([c.name, opts.nameOf(c)])) { const key = norm(n); if (key.length >= 3) index.push({ card: c, key }); }
  $('scan-results').replaceChildren();
  $('scan-status').textContent = '';
  $('scan').showModal();
  startCamera();
}

export function initScanner() {
  const close = () => { stopCamera(); $('scan').close(); };
  $('scan-close').onclick = close;
  $('scan').addEventListener('cancel', stopCamera);
  $('scan').addEventListener('close', stopCamera);
  $('scan-shot').onclick = () => { const v = $('scan-video'); if (v.videoWidth) recognize(v, v.videoWidth, v.videoHeight); };
  $('scan-file').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    stopCamera();
    while (busy) await new Promise((r) => setTimeout(r, 100));
    const bmp = await createImageBitmap(f);
    recognize(bmp, bmp.width, bmp.height, { x: 0, y: 0, w: 1, h: 1 });
    e.target.value = '';
  };
}
