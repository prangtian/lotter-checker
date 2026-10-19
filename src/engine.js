// ===== Lotto engine (pure functions) =====
const PRIZES = {
  p1:    { name: 'รางวัลที่ 1', short: 'ที่ 1', amt: 6000000, len: 6, n: 1, w: 10 },
  near1: { name: 'ข้างเคียงรางวัลที่ 1', short: 'ข้างเคียง', amt: 100000, len: 6, n: 2, w: 4 },
  p2:    { name: 'รางวัลที่ 2', short: 'ที่ 2', amt: 200000, len: 6, n: 5, w: 5 },
  p3:    { name: 'รางวัลที่ 3', short: 'ที่ 3', amt: 80000, len: 6, n: 10, w: 3 },
  p4:    { name: 'รางวัลที่ 4', short: 'ที่ 4', amt: 40000, len: 6, n: 50, w: 2 },
  p5:    { name: 'รางวัลที่ 5', short: 'ที่ 5', amt: 20000, len: 6, n: 100, w: 1 },
  f3:    { name: 'เลขหน้า 3 ตัว', short: 'หน้า 3', amt: 4000, len: 3, n: 2, w: 0 },
  l3:    { name: 'เลขท้าย 3 ตัว', short: 'ท้าย 3', amt: 4000, len: 3, n: 2, w: 0 },
  l2:    { name: 'เลขท้าย 2 ตัว', short: 'ท้าย 2', amt: 2000, len: 2, n: 1, w: 0 },
};
const PRIZE_KEYS = Object.keys(PRIZES);
const SIX = ['p1', 'near1', 'p2', 'p3', 'p4', 'p5'];

const pad6 = (n) => String(n).padStart(6, '0');
const sortStr = (s) => s.split('').sort().join('');
const rev = (s) => s.split('').reverse().join('');

function normDraw(d) {
  const o = { ...d };
  PRIZE_KEYS.forEach((k) => { o[k] = Array.isArray(o[k]) ? o[k].slice() : []; });
  if (o.p1.length && !o.near1.length) {
    const v = parseInt(o.p1[0], 10);
    o.near1 = [v - 1, v + 1].filter((x) => x >= 0 && x <= 999999).map(pad6);
  }
  o.partial = ['p2', 'p3', 'p4', 'p5'].every((k) => !o[k].length);
  // index of 6-digit prizes by their sorted digits, for "same digits, different order" lookups
  o.permIdx = new Map();
  SIX.forEach((k) => o[k].forEach((num) => {
    const key = sortStr(num);
    if (!o.permIdx.has(key)) o.permIdx.set(key, []);
    o.permIdx.get(key).push({ k, num });
  }));
  return o;
}

// prize rates changed on 1 Sep 2015 (2558); older amounts are not shown
const NEW_RATES = '2015-09-01';
const amtFor = (k, date) => (date >= NEW_RATES ? PRIZES[k].amt : null);
const EMPTY = { near1: [], p2: [], p3: [], p4: [], p5: [], f3: [], l3: [], l2: [] };
function nearP1(t, d) { return nearMisses(t, { ...EMPTY, p1: d.p1 }); }

// every 6-digit prize in draw d that uses exactly the ticket's digits in a different order
function permHits(t, d) {
  const list = (d.permIdx && d.permIdx.get(sortStr(t))) || [];
  return list.filter((x) => x.num !== t && !(x.k === 'near1' && d.p1.includes(t)));
}
// how many distinct orderings a ticket's digits allow
function permCount(t) {
  const f = (n) => (n <= 1 ? 1 : n * f(n - 1));
  const c = {}; t.split('').forEach((x) => (c[x] = (c[x] || 0) + 1));
  return Object.values(c).reduce((a, n) => a / f(n), f(t.length));
}

function exactHits(t, d) {
  const hits = [];
  SIX.forEach((k) => { if (d[k].includes(t)) hits.push({ k, num: t }); });
  if (d.f3.includes(t.slice(0, 3))) hits.push({ k: 'f3', num: t.slice(0, 3) });
  if (d.l3.includes(t.slice(3))) hits.push({ k: 'l3', num: t.slice(3) });
  if (d.l2.includes(t.slice(4))) hits.push({ k: 'l2', num: t.slice(4) });
  return hits;
}

// display mask: per slot of the 6-slot row → 'eq' same digit same place, 'in' digit present elsewhere, '' none, null empty slot
function maskFor(t, num, offset) {
  const seg = t.slice(offset, offset + num.length).split('');
  const pool = seg.slice();
  const eq = num.split('').map((c, i) => c === seg[i]);
  eq.forEach((e, i) => { if (e) pool.splice(pool.indexOf(num[i]), 1); });
  const out = Array(6).fill(null);
  num.split('').forEach((c, i) => {
    let m = '';
    if (eq[i]) m = 'eq';
    else { const j = pool.indexOf(c); if (j >= 0) { m = 'in'; pool.splice(j, 1); } }
    out[offset + i] = { c, m };
  });
  return out;
}

function nearMisses(t, d) {
  const res = [];
  const tn = parseInt(t, 10);
  SIX.forEach((k) => {
    const w = PRIZES[k].w;
    const factor = 0.6 + 0.1 * w;
    d[k].forEach((P) => {
      if (P === t) return;
      if (k === "near1" && d.p1.includes(t)) return;
      const tags = [];
      let pos = 0; for (let i = 0; i < 6; i++) if (P[i] === t[i]) pos++;
      let suf = 0; while (suf < 6 && P[5 - suf] === t[5 - suf]) suf++;
      let pre = 0; while (pre < 6 && P[pre] === t[pre]) pre++;
      if (P === t.slice(3) + t.slice(0, 3)) tags.push({ s: 60, kind: 'swap', label: 'สลับหน้า-หลัง (3 ตัวหน้า ↔ 3 ตัวท้าย)' });
      if (P === rev(t)) tags.push({ s: 55, kind: 'swap', label: 'กลับเลขทั้งชุด' });
      if (sortStr(P) === sortStr(t)) tags.push({ s: 50, kind: 'swap', label: 'เลขชุดเดียวกัน แต่สลับตำแหน่ง' });
      if (pos === 5) tags.push({ s: 70, kind: 'pos', label: 'ตรง 5 จาก 6 หลัก' });
      else if (pos === 4) tags.push({ s: 35, kind: 'pos', label: 'ตรง 4 จาก 6 หลัก' });
      else if (pos === 3 && k === 'p1') tags.push({ s: 14, kind: 'pos', label: 'ตรง 3 จาก 6 หลัก' });
      if (suf >= 4 || (suf === 3 && k === 'p1')) tags.push({ s: suf === 3 ? 12 : 30 + (suf - 4) * 15, kind: 'pos', label: `${suf} ตัวท้ายตรง` });
      if (pre >= 4 || (pre === 3 && k === 'p1')) tags.push({ s: pre === 3 ? 12 : 30 + (pre - 4) * 15, kind: 'pos', label: `${pre} ตัวหน้าตรง` });
      if (k === 'p1') {
        const diff = Math.abs(parseInt(P, 10) - tn);
        if (diff > 1 && diff <= 100) tags.push({ s: 40 - diff / 3, kind: 'dist', label: `ห่างจากรางวัลที่ 1 อยู่ ${diff}` });
      }
      if (!tags.length) return;
      tags.sort((a, b) => b.s - a.s);
      const score = (tags[0].s + 0.3 * tags.slice(1).reduce((a, b) => a + b.s, 0)) * factor;
      res.push({ k, num: P, tags, score, mask: maskFor(t, P, 0) });
    });
  });

  const front = t.slice(0, 3), back = t.slice(3), last2 = t.slice(4), front2 = t.slice(0, 2);
  const three = (k, mine, other, mineName, otherName, offMine, offOther) => {
    d[k].forEach((F) => {
      const tags = [];
      if (F !== mine) {
        if (sortStr(F) === sortStr(mine)) tags.push({ s: 30, kind: 'swap', label: `${mineName}สลับตำแหน่ง (โต๊ด)` });
        let p = 0; for (let i = 0; i < 3; i++) if (F[i] === mine[i]) p++;
        if (p === 2) tags.push({ s: 12, kind: 'pos', label: `${mineName}ตรง 2 จาก 3 หลัก` });
        if (Math.abs(parseInt(F, 10) - parseInt(mine, 10)) === 1) tags.push({ s: 18, kind: 'dist', label: `${mineName}ห่างแค่ 1` });
      }
      let off = offMine;
      if (F === other) { tags.push({ s: 38, kind: 'swap', label: `${otherName}ของคุณ ไปออกเป็น${PRIZES[k].name} (สลับหน้า-หลัง)` }); off = offOther; }
      else if (sortStr(F) === sortStr(other) && F !== mine) { tags.push({ s: 15, kind: 'swap', label: `${otherName}ของคุณ สลับตำแหน่งไปออกเป็น${PRIZES[k].name}` }); if (!tags.some((x) => x.label.startsWith(mineName))) off = offOther; }
      if (!tags.length) return;
      tags.sort((a, b) => b.s - a.s);
      const score = tags[0].s + 0.3 * tags.slice(1).reduce((a, b) => a + b.s, 0);
      res.push({ k, num: F, tags, score, mask: maskFor(t, F, off) });
    });
  };
  three('f3', front, back, 'เลขหน้า 3 ตัว', 'เลขท้าย 3 ตัว', 0, 3);
  three('l3', back, front, 'เลขท้าย 3 ตัว', 'เลขหน้า 3 ตัว', 3, 0);

  d.l2.forEach((X) => {
    const tags = []; let off = 4;
    if (X !== last2) {
      if (rev(X) === last2) tags.push({ s: 25, kind: 'swap', label: 'เลขท้าย 2 ตัวกลับหัว (กลับเลข)' });
      if (Math.abs(parseInt(X, 10) - parseInt(last2, 10)) === 1) tags.push({ s: 15, kind: 'dist', label: 'เลขท้าย 2 ตัวห่างแค่ 1' });
    }
    if (X === front2 && X !== last2) { tags.push({ s: 18, kind: 'swap', label: '2 ตัวหน้าของคุณ ตรงกับเลขท้าย 2 ตัว' }); if (tags.length === 1) off = 0; }
    if (!tags.length) return;
    tags.sort((a, b) => b.s - a.s);
    res.push({ k: 'l2', num: X, tags, score: tags[0].s, mask: maskFor(t, X, off) });
  });

  return res.sort((a, b) => b.score - a.score);
}

// ===== Paste parser =====
const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
function parseDraw(raw) {
  let text = String(raw || '').replace(/[๐-๙]/g, (c) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(c)));
  const heads = [];
  const add = (re, k) => { let m; re.lastIndex = 0; while ((m = re.exec(text))) heads.push({ k: typeof k === 'function' ? k(m) : k, s: m.index, e: m.index + m[0].length }); };
  add(/ข้างเคียง(?:รางวัลที่\s*1)?/g, 'near1');
  add(/รางวัลที่\s*([1-5])(?!\d)/g, (m) => 'p' + m[1]);
  add(/เลขหน้า\s*3\s*ตัว/g, 'f3');
  add(/เลขท้าย\s*3\s*ตัว/g, 'l3');
  add(/เลขท้าย\s*2\s*ตัว/g, 'l2');
  // drop "รางวัลที่ 1" heads that sit inside a ข้างเคียง head
  const H = heads.filter((h) => !heads.some((o) => o !== h && o.s <= h.s && o.e >= h.e && (o.e - o.s) > (h.e - h.s))).sort((a, b) => a.s - b.s);
  const out = {}; PRIZE_KEYS.forEach((k) => (out[k] = []));
  const tokRe = /\d[\d,]*/g; let m;
  while ((m = tokRe.exec(text))) {
    const tok = m[0]; const at = m.index;
    if (tok.includes(',')) continue;
    if (/^\s*บาท/.test(text.slice(at + tok.length, at + tok.length + 6))) continue;
    if (H.some((h) => at >= h.s && at < h.e)) continue;
    let cur = null; for (const h of H) { if (h.s <= at) cur = h; else break; }
    if (!cur) continue;
    const k = cur.k, L = PRIZES[k].len;
    let vals = [];
    if (tok.length === L) vals = [tok];
    else if ((k === 'f3' || k === 'l3') && tok.length === 6) vals = [tok.slice(0, 3), tok.slice(3)];
    vals.forEach((v) => { if (!out[k].includes(v) && out[k].length < PRIZES[k].n) out[k].push(v); });
  }
  let date = '';
  const dm = text.match(new RegExp('(\\d{1,2})\\s*(' + TH_MONTHS.join('|') + ')\\s*(?:พ\\.ศ\\.\\s*)?(25\\d\\d)'));
  if (dm) date = `${parseInt(dm[3], 10) - 543}-${String(TH_MONTHS.indexOf(dm[2]) + 1).padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  return { date, ...out };
}


// ===== Draw-slot statistics & "prediction" =====
// A slot is a calendar position: early (1st) or late (16th) of a month. 30 Dec belongs to January-early.
function slotOf(date) {
  let [y, m, d] = date.split('-').map(Number);
  if (d >= 28) { m++; if (m > 12) { m = 1; y++; } return { y, m, half: 0 }; }
  return { y, m, half: d >= 14 ? 1 : 0 };
}
const slotKey = (s) => s.m * 2 + s.half;
function slotDate(s) {
  if (s.half === 1) return `${s.y}-${String(s.m).padStart(2, '0')}-${s.m === 1 ? 17 : 16}`;
  if (s.m === 1) return `${s.y - 1}-12-30`;
  return `${s.y}-${String(s.m).padStart(2, '0')}-${s.m === 5 ? '02' : '01'}`;
}
function nextSlot(date) {
  const s = slotOf(date);
  if (s.half === 0) return { y: s.y, m: s.m, half: 1 };
  return s.m === 12 ? { y: s.y + 1, m: 1, half: 0 } : { y: s.y, m: s.m + 1, half: 0 };
}

function slotStats(list) {
  const pos = Array.from({ length: 6 }, () => Array(10).fill(0));
  const cnt = { l2: new Map(), l3: new Map(), f3: new Map() };
  const posOf = { l2: Array.from({ length: 2 }, () => Array(10).fill(0)), l3: Array.from({ length: 3 }, () => Array(10).fill(0)), f3: Array.from({ length: 3 }, () => Array(10).fill(0)) };
  const nOf = { p1: 0, l2: 0, l3: 0, f3: 0 };
  list.forEach((d) => {
    if (d.p1[0]) { nOf.p1++; d.p1[0].split('').forEach((c, i) => pos[i][+c]++); }
    ['l2', 'l3', 'f3'].forEach((k) => {
      if (d[k].length) nOf[k]++;
      d[k].forEach((v) => { cnt[k].set(v, (cnt[k].get(v) || 0) + 1); v.split('').forEach((c, i) => posOf[k][i][+c]++); });
    });
  });
  return { pos, cnt, posOf, nOf, n: list.length };
}

function topNumbers(st, k, len, n) {
  const all = [];
  for (let v = 0; v < 10 ** len; v++) {
    const s = String(v).padStart(len, '0');
    const c = st.cnt[k].get(s) || 0;
    let w = 1; s.split('').forEach((ch, i) => (w *= st.posOf[k][i][+ch] + 1));
    all.push({ num: s, c, w });
  }
  all.sort((a, b) => b.c - a.c || b.w - a.w || a.num.localeCompare(b.num));
  return all.slice(0, n);
}

function topP1(st, n) {
  let beam = [{ s: '', w: 1 }];
  for (let i = 0; i < 6; i++) {
    const next = [];
    beam.forEach((b) => st.pos[i].forEach((c, dgt) => next.push({ s: b.s + dgt, w: b.w * (c + 1) })));
    next.sort((a, b) => b.w - a.w || a.s.localeCompare(b.s));
    beam = next.slice(0, 40);
  }
  return beam.slice(0, n).map((b) => b.s);
}

function predict(list) {
  const st = slotStats(list);
  return {
    st,
    p1: topP1(st, 3),
    l2: topNumbers(st, 'l2', 2, 5),
    l3: topNumbers(st, 'l3', 3, 5),
    f3: topNumbers(st, 'f3', 3, 5),
  };
}

// Walk forward through history: predict each draw from earlier draws only, then score it.
function backtest(D, mode) {
  const asc = D.slice().sort((a, b) => a.date.localeCompare(b.date));
  const r = { n: 0, l2: 0, l2Exp: 0, l3: 0, l3Exp: 0, f3: 0, f3N: 0, f3Exp: 0, p1Dig: 0, p1Best: 0 };
  const minPrior = mode === 'slot' ? 5 : 50;
  asc.forEach((d, i) => {
    const prior = asc.slice(0, i).filter((x) => mode !== 'slot' || slotKey(slotOf(x.date)) === slotKey(slotOf(d.date)));
    if (prior.length < minPrior || !d.p1[0]) return;
    const pr = predict(prior);
    r.n++;
    const top = (arr) => new Set(arr.map((x) => x.num));
    if (top(pr.l2).has(d.l2[0])) r.l2++;
    r.l2Exp += 5 / 100;
    const l3w = new Set(d.l3); const tl3 = top(pr.l3);
    if ([...l3w].some((v) => tl3.has(v))) r.l3++;
    r.l3Exp += 1 - Math.pow(1 - l3w.size / 1000, 5);
    if (d.f3.length) {
      r.f3N++; const f3w = new Set(d.f3); const tf3 = top(pr.f3);
      if ([...f3w].some((v) => tf3.has(v))) r.f3++;
      r.f3Exp += 1 - Math.pow(1 - f3w.size / 1000, 5);
    }
    const g = pr.p1[0]; let m = 0; for (let j = 0; j < 6; j++) if (g[j] === d.p1[0][j]) m++;
    r.p1Dig += m; r.p1Best = Math.max(r.p1Best, m);
  });
  return r;
}

// Chi-square test that first-prize digits are uniform at each position (Wilson–Hilferty approximation)
function uniformityP(pos) {
  const out = pos.map((row) => {
    const n = row.reduce((a, b) => a + b, 0), e = n / 10;
    const chi = row.reduce((a, o) => a + (o - e) ** 2 / e, 0), k = 9;
    const z = (Math.cbrt(chi / k) - (1 - 2 / (9 * k))) / Math.sqrt(2 / (9 * k));
    const p = 0.5 * erfc(z / Math.SQRT2);
    return { chi, p };
  });
  return out;
}
function erfc(x) { // Abramowitz-Stegun 7.1.26
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 1 - s * y;
}

if (typeof module !== 'undefined') module.exports = { slotOf, slotKey, slotDate, nextSlot, slotStats, predict, backtest, uniformityP, permHits, permCount, amtFor, nearP1, PRIZES, PRIZE_KEYS, SIX, normDraw, exactHits, nearMisses, parseDraw, maskFor };
