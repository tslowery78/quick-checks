// Renders the tool list and a generic calculator page from the specs in tools.js.
// Routing is hash-based (#/beam?m=ssUDL&L=120~in...) so every calculation is a shareable link.
import { UNITS, toSI, fromSI, convert } from './calcs.js';
import { TOOLS } from './tools.js';

const $ = (sel, el = document) => el.querySelector(sel);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
};

let sys = localStorage.getItem('unitSystem') || 'us';
const main = $('#main');

export function fmt(x) {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e6 || a < 1e-3) return x.toExponential(3).replace(/\.?0+e/, 'e');
  return String(Number(x.toPrecision(4)));
}

const defUnit = (dim) => UNITS[dim][sys];
const unitSelect = (dim, value, onchange) =>
  h('select', { class: 'unit', 'aria-label': 'unit', onchange }, Object.keys(UNITS[dim].u).map(u => h('option', { value: u, selected: u === value }, u)));

// ---------- Home ----------
function renderHome() {
  document.title = 'Engineering Quick Checks';
  const groups = [...new Set(TOOLS.map(t => t.group))];
  main.replaceChildren(
    h('p', { class: 'lede' }, 'Fast, transparent hand-calc checks. Every tool shows its formula, assumptions, and source, and every result is a link you can share.'),
    ...groups.map(g => h('section', { class: 'group' },
      h('h2', {}, g),
      h('div', { class: 'cards' }, TOOLS.filter(t => t.group === g).map(t =>
        h('a', { class: 'card', href: `#/${t.id}` }, h('strong', {}, t.title), h('span', {}, t.blurb)))))),
    h('section', { class: 'group' }, h('h2', {}, 'Utilities'),
      h('div', { class: 'cards' }, h('a', { class: 'card', href: '#/units' }, h('strong', {}, 'Unit converter'), h('span', {}, 'Length, force, stress, inertia, stiffness, acceleration in g, and more.')))),
  );
}

// ---------- Unit converter ----------
function renderUnits(params) {
  document.title = 'Unit converter · Engineering Quick Checks';
  let dim = UNITS[params.get('dim')] && params.get('dim') !== 'none' ? params.get('dim') : 'stress';
  const card = h('div', { class: 'tool' });
  const draw = (val = '1', from, to) => {
    const names = Object.keys(UNITS[dim].u);
    from = names.includes(from) ? from : UNITS[dim].us;
    to = names.includes(to) ? to : (UNITS[dim].si !== from ? UNITS[dim].si : names[0]);
    const inp = h('input', { type: 'text', inputmode: 'decimal', value: val });
    const fromSel = unitSelect(dim, from), toSel = unitSelect(dim, to);
    const out = h('output', { class: 'big' });
    const update = () => {
      const v = Number(inp.value);
      out.textContent = Number.isFinite(v) && inp.value.trim() !== '' ? `${fmt(convert(v, dim, fromSel.value, toSel.value))} ${toSel.value}` : '—';
      history.replaceState(null, '', `#/units?dim=${dim}&v=${encodeURIComponent(inp.value)}&from=${encodeURIComponent(fromSel.value)}&to=${encodeURIComponent(toSel.value)}`);
    };
    [inp, fromSel, toSel].forEach(e => e.addEventListener('input', update));
    const dimSel = h('select', { onchange: e => { dim = e.target.value; draw(inp.value); } },
      Object.keys(UNITS).filter(d => d !== 'none').map(d => h('option', { value: d, selected: d === dim }, d)));
    card.replaceChildren(h('h1', {}, 'Unit converter'),
      h('div', { class: 'row' }, h('label', {}, 'Quantity'), dimSel),
      h('div', { class: 'row' }, h('label', {}, 'Value'), h('div', { class: 'field' }, inp, fromSel)),
      h('div', { class: 'row' }, h('label', {}, 'Convert to'), toSel),
      h('div', { class: 'result' }, out));
    update();
  };
  draw(params.get('v') || '1', params.get('from'), params.get('to'));
  main.replaceChildren(backLink(), card);
}

// ---------- Generic calculator ----------
function renderTool(tool, params) {
  document.title = `${tool.title} · Engineering Quick Checks`;
  const modeKeys = tool.modes?.map(m => m[0]);
  let mode = modeKeys?.includes(params.get('m')) ? params.get('m') : modeKeys?.[0];
  const idx = sys === 'us' ? 0 : 1;

  // Build each input once; mode changes only show/hide rows.
  const fields = tool.inputs.map(spec => {
    const [pv, pu] = (params.get(spec.key) ?? '').split('~');
    let unit = spec.type === 'text' ? null : (spec.unit || defUnit(spec.dim));
    if (pu && spec.dim && UNITS[spec.dim].u[pu] !== undefined) unit = pu;
    const value = params.has(spec.key) ? pv : String(spec.unit ? fmt(convert(spec.def[idx], spec.dim, spec.unit, unit)) : spec.def[idx]);
    const input = spec.type === 'text'
      ? h('textarea', { rows: 6, spellcheck: 'false' }, value)
      : h('input', { type: 'text', inputmode: 'decimal', value, 'aria-label': spec.label });
    const sel = spec.type === 'text' || spec.dim === 'none' ? null : unitSelect(spec.dim, unit, () => {
      // Keep the physical quantity when the unit changes.
      const v = Number(input.value);
      if (input.value.trim() !== '' && Number.isFinite(v)) input.value = fmt(convert(v, spec.dim, sel.dataset.prev, sel.value));
      sel.dataset.prev = sel.value; update();
    });
    if (sel) sel.dataset.prev = unit;
    input.addEventListener('input', () => update());
    const row = h('div', { class: spec.type === 'text' ? 'row wide' : 'row' }, h('label', {}, spec.label), h('div', { class: 'field' }, input, sel));
    return { spec, input, sel, row };
  });

  const outs = tool.outputs.map(spec => {
    const val = h('output', {});
    const sel = spec.dim === 'none' ? null : unitSelect(spec.dim, params.get('o_' + spec.key) || defUnit(spec.dim), () => update());
    const row = h('div', { class: 'row out' }, h('label', {}, spec.label), h('div', { class: 'field' }, val, sel));
    return { spec, val, sel, row };
  });

  const err = h('p', { class: 'error', role: 'alert' });
  const extra = h('div', {});
  const modeBar = tool.modes ? h('div', { class: 'modes', role: 'tablist' }, tool.modes.map(([k, label]) =>
    h('button', { type: 'button', 'data-k': k, onclick: () => { mode = k; update(); } }, label))) : null;

  let last = null;
  function update() {
    modeBar?.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.k === mode));
    const active = fields.filter(f => !f.spec.modes || f.spec.modes.includes(mode));
    fields.forEach(f => { f.row.hidden = !active.includes(f); });
    err.textContent = ''; extra.replaceChildren();
    const si = {}; let bad = null;
    for (const f of active) {
      if (f.spec.type === 'text') { si[f.spec.key] = f.input.value; continue; }
      const v = Number(f.input.value);
      const ok = f.input.value.trim() !== '' && Number.isFinite(v);
      f.input.classList.toggle('bad', !ok);
      if (!ok) bad ??= f.spec.label;
      si[f.spec.key] = ok ? (f.sel ? toSI(v, f.spec.dim, f.sel.value) : v) : NaN;
    }
    let res = {};
    if (bad) err.textContent = `Check the input: ${bad}.`;
    else try { res = tool.compute(si, mode); } catch (e) { err.textContent = e.message; res = {}; }
    for (const o of outs) {
      const x = res[o.spec.key];
      const shown = Number.isFinite(x) ? (o.sel ? fromSI(x, o.spec.dim, o.sel.value) : x) : NaN;
      o.val.textContent = fmt(shown);
      o.row.hidden = !Number.isFinite(x) && !bad && !err.textContent;
      o.row.classList.toggle('pass', !!o.spec.margin && shown >= 0);
      o.row.classList.toggle('fail', !!o.spec.margin && shown < 0);
    }
    if (res._table) extra.append(h('table', {}, h('thead', {}, h('tr', {}, res._table.head.map(c => h('th', {}, c)))),
      h('tbody', {}, res._table.rows.map(r => h('tr', {}, r.map(c => h('td', {}, c)))))));
    last = { active, res };
    history.replaceState(null, '', shareHash());
  }

  function shareHash() {
    const q = new URLSearchParams();
    if (mode) q.set('m', mode);
    for (const f of last.active) q.set(f.spec.key, f.sel ? `${f.input.value}~${f.sel.value}` : f.input.value);
    for (const o of outs) if (o.sel && o.sel.value !== defUnit(o.spec.dim)) q.set('o_' + o.spec.key, o.sel.value);
    return `#/${tool.id}?${q}`;
  }

  function calcSheet() {
    const lines = [`${tool.title}${mode ? ' — ' + tool.modes.find(m => m[0] === mode)[1] : ''}`, `Date: ${new Date().toISOString().slice(0, 10)}`, '', 'Inputs'];
    for (const f of last.active) lines.push(f.spec.type === 'text' ? `  ${f.spec.label}:\n    ${f.input.value.split('\n').join('\n    ')}` : `  ${f.spec.label} = ${f.input.value} ${f.sel?.value ?? ''}`.trimEnd());
    lines.push('', 'Results');
    for (const o of outs) if (!o.row.hidden) lines.push(`  ${o.spec.label} = ${o.val.textContent} ${o.sel?.value ?? ''}`.trimEnd());
    lines.push('', `Formula: ${tool.formula}`, 'Assumptions:', ...tool.assumptions.map(a => `  - ${a}`), `Reference: ${tool.refs}`, `Link: ${location.href}`,
      '', 'Preliminary estimate only; not a substitute for a checked analysis.');
    return lines.join('\n');
  }

  const toast = h('span', { class: 'toast', 'aria-live': 'polite' });
  const copy = async (text, msg) => {
    try { await navigator.clipboard.writeText(text); toast.textContent = msg; } catch { toast.textContent = 'Copy failed; select and copy manually.'; }
    setTimeout(() => { toast.textContent = ''; }, 2000);
  };

  main.replaceChildren(backLink(), h('div', { class: 'tool' },
    h('h1', {}, tool.title), h('p', { class: 'blurb' }, tool.blurb), modeBar,
    h('div', { class: 'grid' },
      h('fieldset', {}, h('legend', {}, 'Inputs'), fields.map(f => f.row)),
      h('fieldset', {}, h('legend', {}, 'Results'), outs.map(o => o.row), err, extra)),
    h('div', { class: 'actions' },
      h('button', { type: 'button', onclick: () => copy(location.href, 'Link copied') }, 'Copy link'),
      h('button', { type: 'button', onclick: () => copy(calcSheet(), 'Calc sheet copied') }, 'Copy calc sheet'),
      h('a', { class: 'button', href: `#/${tool.id}` }, 'Reset'), toast),
    h('details', { open: true }, h('summary', {}, 'Formula, assumptions, source'),
      h('p', { class: 'formula' }, tool.formula),
      h('ul', {}, tool.assumptions.map(a => h('li', {}, a))),
      h('p', { class: 'refs' }, tool.refs))));
  update();
}

const backLink = () => h('a', { class: 'back', href: '#/' }, '← All tools');

function route() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query || '');
  const tool = TOOLS.find(t => t.id === path);
  if (path === 'units') renderUnits(params);
  else if (tool) renderTool(tool, params);
  else renderHome();
  window.scrollTo(0, 0);
}

function renderSysToggle() {
  const box = $('#sys');
  box.replaceChildren(...['us', 'si'].map(s => h('button', {
    type: 'button', class: s === sys ? 'on' : '', 'aria-pressed': String(s === sys),
    onclick: () => { sys = s; localStorage.setItem('unitSystem', s); renderSysToggle(); location.hash = location.hash.split('?')[0] || '#/'; route(); },
  }, s.toUpperCase())));
}

window.addEventListener('hashchange', route);
renderSysToggle();
route();
