// Tiny dependency-free canvas plotter for tool demos. One focal curve, faint context curves,
// optional vertical guide, one marked operating point. Axes are log10 or linear.
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export function drawPlot(canvas, o) {
  // o: {xlog, ylog, xmin, xmax, ymin, ymax, xlabel, ylabel, curves:[{pts,faint,label}], vline:{x,label}, point:{x,y}}
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ink = css('--ink'), muted = css('--muted'), line = css('--line'), accent = css('--accent');
  const L = 52, R = 12, T = 12, B = 44, pw = W - L - R, ph = H - T - B;
  const tx = (v) => o.xlog ? Math.log10(v) : v, ty = (v) => o.ylog ? Math.log10(v) : v;
  const X = (v) => L + (tx(v) - tx(o.xmin)) / (tx(o.xmax) - tx(o.xmin)) * pw;
  const Y = (v) => T + ph - (ty(Math.min(Math.max(v, o.ymin), o.ymax)) - ty(o.ymin)) / (ty(o.ymax) - ty(o.ymin)) * ph;
  const ticks = (lo, hi, log) => {
    const out = [];
    if (log) for (let e = Math.ceil(Math.log10(lo) - 1e-9); e <= Math.floor(Math.log10(hi) + 1e-9); e++) out.push(10 ** e);
    else { const step = 10 ** Math.floor(Math.log10((hi - lo) / 4)); const m = [1, 2, 5, 10].find(k => (hi - lo) / (k * step) <= 6) * step; for (let v = Math.ceil(lo / m) * m; v <= hi + 1e-9; v += m) out.push(v); }
    return out;
  };
  const lab = (v) => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)) ? v.toExponential(0) : String(+v.toPrecision(3));
  g.font = '13px system-ui, sans-serif'; g.lineWidth = 1;
  g.strokeStyle = line; g.fillStyle = muted;
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (const v of ticks(o.xmin, o.xmax, o.xlog)) { g.beginPath(); g.moveTo(X(v), T); g.lineTo(X(v), T + ph); g.stroke(); g.fillText(lab(v), X(v), T + ph + 4); }
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const v of ticks(o.ymin, o.ymax, o.ylog)) { g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(L + pw, Y(v)); g.stroke(); g.fillText(lab(v), L - 6, Y(v)); }
  g.strokeStyle = muted; g.strokeRect(L, T, pw, ph);
  g.fillStyle = ink; g.font = '14px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
  g.fillText(o.xlabel, L + pw / 2, H - 2);
  g.save(); g.translate(13, T + ph / 2); g.rotate(-Math.PI / 2); g.textBaseline = 'top'; g.fillText(o.ylabel, 0, -4); g.restore();
  g.save(); g.beginPath(); g.rect(L, T, pw, ph); g.clip();
  if (o.vline) {
    g.setLineDash([5, 4]); g.strokeStyle = muted; g.beginPath(); g.moveTo(X(o.vline.x), T); g.lineTo(X(o.vline.x), T + ph); g.stroke(); g.setLineDash([]);
    if (o.vline.label) { g.fillStyle = muted; g.font = '12px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(o.vline.label, X(o.vline.x) + 4, T + 3); }
  }
  for (const c of o.curves) {
    g.beginPath(); c.pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
    g.strokeStyle = c.faint ? line : accent; g.lineWidth = c.faint ? 1.5 : 3; g.globalAlpha = c.faint ? 1 : 1; g.stroke();
  }
  g.restore();
  g.lineWidth = 1;
  for (const c of o.curves) if (c.faint && c.label) { // label each faint curve at its right end
    const [x, y] = c.pts[c.pts.length - 1];
    g.fillStyle = muted; g.font = '11px system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(c.label, X(x) - 2, Y(y) - 1);
  }
  if (o.point && o.point.x >= o.xmin && o.point.x <= o.xmax) {
    g.beginPath(); g.arc(X(o.point.x), Y(o.point.y), 7, 0, 2 * Math.PI);
    g.fillStyle = accent; g.fill(); g.strokeStyle = css('--panel'); g.lineWidth = 2; g.stroke();
  }
}

// Log-spaced sample points from lo to hi.
export const logspace = (lo, hi, n) => Array.from({ length: n }, (_, i) => lo * (hi / lo) ** (i / (n - 1)));
