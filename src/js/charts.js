// Small hand-drawn SVG charts. Thin bars with a 4px rounded end, recessive grid, hover tooltips (data-tip).
import { esc } from './util.js';

const BAR = 16; // bar thickness cap
function roundEndBarH(x, y, w, h, r = 4) {
  // horizontal bar, square at the baseline (left), rounded at the data end (right)
  if (w <= 0) return '';
  r = Math.min(r, w, h / 2);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}
function roundEndBarV(x, y, w, h, r = 4) {
  // vertical column, square at the baseline (bottom), rounded at the top
  if (h <= 0) return '';
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
function measure(text, size = 12) { return String(text).length * size * 0.52; }

// rows: [{ label, value, display, color, tip, act, id }]
export function hbars(width, rows, opts = {}) {
  const labelW = opts.labelW ?? Math.min(170, Math.max(70, ...rows.map((r) => measure(r.label, 12.5) + 10)));
  const valW = opts.valW ?? Math.max(60, ...rows.map((r) => measure(r.display ?? r.value, 12) + 12));
  const rowH = opts.rowH || 30;
  const h = rows.length * rowH + 4;
  const plotW = Math.max(40, width - labelW - valW);
  const max = opts.max || Math.max(1, ...rows.map((r) => r.value || 0));
  const parts = [`<svg class="chart" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="${esc(opts.label || 'Bar chart')}">`];
  parts.push(`<line x1="${labelW}" x2="${labelW}" y1="0" y2="${h}" stroke="var(--line)" stroke-width="1"/>`);
  rows.forEach((r, i) => {
    const y = i * rowH + 2;
    const bh = Math.min(BAR, rowH - 12);
    const bw = r.value > 0 ? Math.max(3, (r.value / max) * plotW) : 0;
    const by = y + (rowH - bh) / 2;
    const act = r.act ? ` data-act="${r.act}" data-id="${esc(r.id || '')}" style="cursor:pointer"` : '';
    parts.push(`<g${act}${r.tip ? ` data-tip="${esc(r.tip)}"` : ''}>`);
    parts.push(`<rect class="hit" x="0" y="${y}" width="${width}" height="${rowH}"/>`);
    parts.push(`<text x="${labelW - 10}" y="${y + rowH / 2 + 4}" text-anchor="end" class="${r.strong ? 'lbl-strong' : ''}">${esc(r.label)}</text>`);
    if (bw) parts.push(`<path class="mark" d="${roundEndBarH(labelW, by, bw, bh)}" fill="${r.color || 'var(--blue)'}"/>`);
    parts.push(`<text x="${labelW + bw + 8}" y="${y + rowH / 2 + 4}" class="lbl-strong tnum">${esc(r.display ?? r.value)}</text>`);
    parts.push('</g>');
  });
  parts.push('</svg>');
  return parts.join('');
}

// Ring chart. slices: [{ name, value, color, display }]
export function donut(width, slices, opts = {}) {
  const h = opts.height || 168;
  const total = slices.reduce((s, p) => s + (Number(p.value) || 0), 0);
  const cx = 84, cy = h / 2, R = 58, r = 34;
  const parts = [`<svg class="chart" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="${esc(opts.label || 'Donut chart')}">`];
  if (!total) {
    parts.push(`<text x="${width / 2}" y="${h / 2}" text-anchor="middle" class="muted-t">${esc(opts.empty || 'No data')}</text></svg>`);
    return parts.join('');
  }
  const polar = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  const ring = (a0, a1) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = polar(R, a0), [x1, y1] = polar(R, a1);
    const [ix0, iy0] = polar(r, a1), [ix1, iy1] = polar(r, a0);
    return `M${x0},${y0}A${R},${R} 0 ${large} 1 ${x1},${y1}L${ix0},${iy0}A${r},${r} 0 ${large} 0 ${ix1},${iy1}Z`;
  };
  let a = -Math.PI / 2;
  const visible = slices.filter((p) => p.value > 0);
  if (visible.length === 1) {
    parts.push(`<path class="mark" d="${ring(-Math.PI / 2, -Math.PI / 2 + Math.PI * 2 - 0.001)}" fill="${visible[0].color}"/>`);
  } else {
    visible.forEach((p) => {
      const sweep = (p.value / total) * Math.PI * 2;
      const a1 = a + sweep;
      parts.push(`<path class="mark" d="${ring(a, a1)}" fill="${p.color}" data-tip="${esc(`<b>${esc(p.name)}</b><br>${esc(p.display ?? p.value)}`)}"/>`);
      a = a1;
    });
  }
  parts.push(`<text x="${cx}" y="${cy - 4}" text-anchor="middle" class="lbl-strong" font-size="18">${esc(opts.center || String(total))}</text>`);
  if (opts.centerSub) parts.push(`<text x="${cx}" y="${cy + 14}" text-anchor="middle" class="muted-t">${esc(opts.centerSub)}</text>`);
  let ly = Math.max(18, (h - slices.length * 22) / 2);
  slices.forEach((p) => {
    parts.push(`<rect x="176" y="${ly}" width="10" height="10" rx="2" fill="${p.color}"/>`);
    parts.push(`<text x="192" y="${ly + 9}" class="lbl-strong">${esc(p.name)}</text>`);
    parts.push(`<text x="${width - 8}" y="${ly + 9}" text-anchor="end" class="tnum muted-t">${esc(p.display ?? p.value)}</text>`);
    ly += 22;
  });
  parts.push('</svg>');
  return parts.join('');
}

// Grouped columns. cats: [label], series: [{ name, color, values: [] }]
export function columns(width, cats, series, opts = {}) {
  const h = opts.height || 220;
  const padL = opts.padL ?? 44, padB = 26, padT = 18, padR = 6;
  const plotW = width - padL - padR, plotH = h - padT - padB;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const ticks = 4;
  const band = plotW / cats.length;
  const n = series.length;
  const gap = 2;
  const bw = Math.min(opts.barW || 18, (band * 0.7 - gap * (n - 1)) / n);
  const groupW = bw * n + gap * (n - 1);
  const fmt = opts.fmt || ((v) => String(v));
  const parts = [`<svg class="chart" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="${esc(opts.label || 'Column chart')}">`];
  parts.push('<g class="grid">');
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i;
    const y = padT + plotH - (v / max) * plotH;
    parts.push(`<line x1="${padL}" x2="${width - padR}" y1="${y}" y2="${y}"/><text x="${padL - 8}" y="${y + 4}" text-anchor="end" class="muted-t">${esc(fmt(v, true))}</text>`);
  }
  parts.push('</g>');
  cats.forEach((c, ci) => {
    const gx = padL + band * ci + (band - groupW) / 2;
    const tipHTML = `<b>${esc(opts.tipTitle ? opts.tipTitle(ci) : c)}</b><br>` + series.map((s) => `${esc(s.name)}: <b>${esc(fmt(s.values[ci]))}</b>`).join('<br>');
    parts.push(`<g data-tip="${esc(tipHTML)}">`);
    parts.push(`<rect class="hit" x="${padL + band * ci}" y="${padT}" width="${band}" height="${plotH}"/>`);
    series.forEach((s, si) => {
      const v = s.values[ci] || 0;
      const bh = (v / max) * plotH;
      const x = gx + si * (bw + gap);
      if (bh > 0) parts.push(`<path class="mark" d="${roundEndBarV(x, padT + plotH - Math.max(bh, 2), bw, Math.max(bh, 2))}" fill="${s.color}"/>`);
    });
    parts.push(`<text x="${padL + band * ci + band / 2}" y="${h - 8}" text-anchor="middle" class="${opts.hiCat === ci ? 'lbl-strong' : 'muted-t'}">${esc(c)}</text>`);
    parts.push('</g>');
  });
  parts.push(`<line x1="${padL}" x2="${width - padR}" y1="${padT + plotH}" y2="${padT + plotH}" stroke="var(--line)" stroke-width="1"/>`);
  parts.push('</svg>');
  return parts.join('');
}

// Stacked horizontal bars. rows: [{ label, parts: [{ name, value, color }], total, display }]
export function stackedH(width, rows, opts = {}) {
  const labelW = opts.labelW ?? Math.min(190, Math.max(80, ...rows.map((r) => measure(r.label, 12.5) + 10)));
  const valW = opts.valW ?? 70;
  const rowH = 30;
  const h = rows.length * rowH + 4;
  const plotW = Math.max(40, width - labelW - valW);
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((s, p) => s + p.value, 0)));
  const out = [`<svg class="chart" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="${esc(opts.label || 'Stacked bar chart')}">`];
  out.push(`<line x1="${labelW}" x2="${labelW}" y1="0" y2="${h}" stroke="var(--line)" stroke-width="1"/>`);
  rows.forEach((r, i) => {
    const y = i * rowH + 2;
    const bh = 16, by = y + (rowH - bh) / 2;
    const total = r.parts.reduce((s, p) => s + p.value, 0);
    const tip = `<b>${esc(r.label)}</b><br>` + r.parts.map((p) => `${esc(p.name)}: <b>${p.value}</b>`).join('<br>');
    out.push(`<g data-tip="${esc(tip)}">`);
    out.push(`<rect class="hit" x="0" y="${y}" width="${width}" height="${rowH}"/>`);
    out.push(`<text x="${labelW - 10}" y="${y + rowH / 2 + 4}" text-anchor="end">${esc(r.label)}</text>`);
    let x = labelW;
    const visible = r.parts.filter((p) => p.value > 0);
    visible.forEach((p, pi) => {
      const w = (p.value / max) * plotW;
      const last = pi === visible.length - 1;
      const ww = Math.max(1, w - (last ? 0 : 2));
      out.push(last ? `<path class="mark" d="${roundEndBarH(x, by, ww, bh)}" fill="${p.color}"/>` : `<rect class="mark" x="${x}" y="${by}" width="${ww}" height="${bh}" fill="${p.color}"/>`);
      x += w;
    });
    out.push(`<text x="${x + 8}" y="${y + rowH / 2 + 4}" class="lbl-strong tnum">${esc(r.display ?? total)}</text>`);
    out.push('</g>');
  });
  out.push('</svg>');
  return out.join('');
}

// Offer value across revisions: a step line with labelled first and last points
export function revLine(width, points, fmt) {
  const h = 130, padL = 10, padR = 10, padT = 24, padB = 30;
  if (points.length < 2) return '';
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min *= 0.95; max *= 1.05; }
  const span = max - min;
  min -= span * 0.15; max += span * 0.15;
  const plotW = width - padL - padR, plotH = h - padT - padB;
  const X = (i) => padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const Y = (v) => padT + plotH - ((v - min) / (max - min)) * plotH;
  let d = `M${X(0)},${Y(vals[0])}`;
  for (let i = 1; i < vals.length; i++) d += `H${X(i)}V${Y(vals[i])}`;
  const out = [`<svg class="chart" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="Offer value by revision">`];
  out.push(`<line x1="${padL}" x2="${width - padR}" y1="${padT + plotH}" y2="${padT + plotH}" stroke="var(--line)"/>`);
  out.push(`<path d="${d}" fill="none" stroke="var(--blue)" stroke-width="2" stroke-linejoin="round"/>`);
  points.forEach((p, i) => {
    const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
    out.push(`<g data-tip="${esc(`<b>${esc(p.label)}</b><br>${esc(fmt(p.value))}`)}"><circle cx="${X(i)}" cy="${Y(p.value)}" r="9" fill="transparent"/><circle cx="${X(i)}" cy="${Y(p.value)}" r="4.5" fill="var(--blue)" stroke="#fff" stroke-width="2"/></g>`);
    out.push(`<text x="${X(i)}" y="${h - 6}" text-anchor="${anchor}" class="muted-t">${esc(p.label)}</text>`);
    if (i === 0 || i === points.length - 1) {
      // put the label on the side away from the line: below when the line arrives from above
      const prev = i === 0 ? null : vals[i - 1];
      if (prev !== null && prev > p.value && Y(p.value) - Y(prev) > 14) {
        // the line arrives from above: write the value to the left of the point, under the line
        out.push(`<text x="${X(i) - 10}" y="${Y(p.value) + 4}" text-anchor="end" class="lbl-strong">${esc(fmt(p.value))}</text>`);
      } else {
        out.push(`<text x="${X(i)}" y="${Y(p.value) - 10}" text-anchor="${anchor}" class="lbl-strong">${esc(fmt(p.value))}</text>`);
      }
    }
  });
  out.push('</svg>');
  return out.join('');
}
