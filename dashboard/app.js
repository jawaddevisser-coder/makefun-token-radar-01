// Token Launch Radar — the page. Reads window.RADAR (written by main.ts),
// renders the board, the filters, the sort and one protocol's detail view.
// No network: every number on this page comes from the snapshot data file.
(function () {
  'use strict';
  var R = window.RADAR;
  var rows = R.rows;
  var meta = R.meta;
  var model = R.model;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(v) {
    if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(v);
  }
  function pct(c) {
    if (c === null || c === undefined) return '<span>—</span>';
    var cls = c >= 0 ? 'up' : 'down';
    return '<span class="' + cls + '">' + (c >= 0 ? '+' : '') + c.toFixed(1) + '%</span>';
  }
  function age(a) {
    if (a >= 365) return (a / 365).toFixed(1) + 'y';
    return a + 'd';
  }

  // ---- header + stats -------------------------------------------------
  document.getElementById('asof').textContent = meta.as_of;
  var topPre = rows.filter(function (r) { return !r.live; })[0];
  document.getElementById('stats').innerHTML = [
    ['<b>' + meta.pretoken_total + '</b><span>pre-token protocols scored</span>'],
    ['<b>' + meta.watchlist_total + '</b><span>on the house watchlist ($50M+ floor)</span>'],
    ['<b>' + meta.live_rows + '</b><span>live comparables by market cap</span>'],
    ['<b>' + money(topPre ? topPre.implied_value_usd : 0) + '</b><span>top implied value — ' + esc(topPre ? topPre.name : '') + '</span>'],
  ].map(function (c) { return '<div class="stat">' + c[0] + '</div>'; }).join('');
  document.getElementById('formula').textContent = model.formula;
  document.getElementById('mults').innerHTML = model.category_multiples
    .filter(function (m) { return m.sample >= 1; })
    .map(function (m) {
      return '<tr><td>' + esc(m.category) + '</td><td class="num">' + m.multiple.toFixed(3) + 'x</td><td class="num">' + m.sample + '</td></tr>';
    }).join('');
  document.getElementById('excluded').innerHTML = (R.excluded || []).map(function (x) {
    return '<tr><td><span class="name">' + esc(x.name) + '</span><br><span class="slug">' + esc(x.slug) + '</span></td><td>' + esc(x.category) + '</td><td class="num">' + money(x.tvl_usd) + '</td><td>' + esc(x.reason) + '</td></tr>';
  }).join('');

  // ---- filter controls -------------------------------------------------
  var qEl = document.getElementById('q');
  var scopeEl = document.getElementById('scope');
  var catEl = document.getElementById('cat');
  var chainEl = document.getElementById('chain');
  var sortEl = document.getElementById('sort');
  var rowsEl = document.getElementById('rows');
  var countEl = document.getElementById('count');
  var detailEl = document.getElementById('detail');

  var cats = [];
  var chains = [];
  rows.forEach(function (r) {
    if (cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort();
  chains.sort();
  catEl.innerHTML = '<option value="">All categories</option>' + cats.map(function (c) {
    return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
  }).join('');
  chainEl.innerHTML = '<option value="">All chains</option>' + chains.map(function (c) {
    return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
  }).join('');

  function hashState() {
    var h = {};
    location.hash.slice(1).split('&').forEach(function (part) {
      var kv = part.split('=');
      if (kv[0]) h[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return h;
  }
  function setHash(h) {
    var parts = [];
    Object.keys(h).forEach(function (k) { if (h[k]) parts.push(k + '=' + encodeURIComponent(h[k])); });
    history.replaceState(null, '', parts.length ? '#' + parts.join('&') : location.pathname);
  }
  var state = hashState();
  if (state.q) qEl.value = state.q;
  if (state.scope) scopeEl.value = state.scope;
  if (state.cat) catEl.value = state.cat;
  if (state.chain) chainEl.value = state.chain;
  if (state.sort) sortEl.value = state.sort;

  function filtered() {
    var q = qEl.value.trim().toLowerCase();
    var scope = scopeEl.value;
    var cat = catEl.value;
    var chain = chainEl.value;
    var out = rows.filter(function (r) {
      if (scope === 'pretoken' && r.live) return false;
      if (scope === 'watchlist' && (!r.watchlist || r.live)) return false;
      if (cat && r.category !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      return true;
    });
    var sort = sortEl.value;
    out.sort(function (a, b) {
      if (sort === 'tvl') return b.tvl_usd - a.tvl_usd;
      if (sort === 'growth') return (b.change_7d === null ? -1e9 : b.change_7d) - (a.change_7d === null ? -1e9 : a.change_7d);
      if (sort === 'age') return b.age_days - a.age_days;
      if (sort === 'name') return a.name.localeCompare(b.name);
      return a.rank - b.rank;
    });
    return out;
  }

  function render() {
    var list = filtered();
    var scope = scopeEl.value;
    countEl.textContent = list.length + ' of ' + rows.length + ' protocols shown — ' +
      (scope === 'all' ? 'ranks are the board\u2019s global ranks by implied value.' : 'ranks are pre-token ranks; live comparables are hidden in this view.');
    rowsEl.innerHTML = list.map(function (r) {
      var badges = '';
      if (r.watchlist) badges += '<span class="badge wl">WATCHLIST</span>';
      if (r.live) badges += '<span class="badge live">LIVE</span>';
      var shownRank = scope === 'all' ? r.rank : (r.pretoken_rank || r.rank);
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + shownRank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span>' + badges + '<br><span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category) + '</td>' +
        '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num val">' + money(r.implied_value_usd) + '</td>' +
        '<td class="num">~$' + r.farm_cost_usd + '</td>' +
        '</tr>';
    }).join('');
    setHash({ q: qEl.value.trim(), scope: scopeEl.value === 'pretoken' ? '' : scopeEl.value, cat: catEl.value, chain: chainEl.value, sort: sortEl.value === 'implied' ? '' : sortEl.value, detail: selected });
  }

  // ---- detail view -----------------------------------------------------
  var selected = state.detail || '';
  function showDetail(slug) {
    selected = slug || '';
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) { r = rows[i]; break; }
    var trs = rowsEl.querySelectorAll('tr');
    for (var j = 0; j < trs.length; j++) trs[j].classList.toggle('sel', trs[j].getAttribute('data-slug') === slug);
    if (!r) { detailEl.hidden = true; detailEl.innerHTML = ''; return; }
    var breakdown = r.live
      ? '<p class="model-line">' + esc(r.name) + ' already trades: implied value = market cap ' + money(r.mcap_usd) + ' (no model applied).</p>'
      : '<p class="model-line">' + money(r.tvl_usd) + ' TVL x ' + r.multiple.toFixed(3) + ' (' + esc(r.category) + ' multiple) x ' + r.growth_factor.toFixed(3) + ' (growth) x ' + r.maturity_factor.toFixed(3) + ' (maturity) x ' + r.breadth_factor.toFixed(3) + ' (breadth) = <b>' + money(r.implied_value_usd) + '</b></p>';
    detailEl.innerHTML =
      '<h2>' + esc(r.name) + (r.live ? ' <span class="badge live">LIVE</span>' : r.watchlist ? ' <span class="badge wl">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="meta">Rank #' + r.rank + (r.pretoken_rank ? ' (pre-token #' + r.pretoken_rank + ')' : '') + ' &middot; ' + esc(r.category) + ' &middot; ' + esc(r.chains.join(', ')) + ' &middot; listed ' + (r.listed_at || 'unknown') + ' (' + age(r.age_days) + ' ago) &middot; ' + esc(r.exclusion_note || 'On the house watchlist') + '</p>' +
      '<div class="dgrid">' +
      '<div class="dcell"><b>' + money(r.implied_value_usd) + '</b><span>implied value (' + (r.live ? 'market cap' : 'model') + ')</span></div>' +
      '<div class="dcell"><b>' + money(r.tvl_usd) + '</b><span>TVL' + (r.change_7d === null ? '' : ' &middot; ' + (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '% in 7d') + '</span></div>' +
      '<div class="dcell"><b>~$' + r.farm_cost_usd + '</b><span>estimated farm cost (gas + $25 position)</span></div>' +
      '<div class="dcell"><b>' + r.farm_weeks + ' weeks</b><span>suggested farming horizon</span></div>' +
      '</div>' +
      '<h3>Why it is worth ' + money(r.implied_value_usd) + '</h3>' + breakdown +
      '<h3>How to farm it</h3>' +
      '<ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="note">Farm steps are a plan, not a promise: a protocol may never issue a token, and keeping funds in a protocol carries smart-contract risk. Never farm with money you cannot afford to lose.</p>';
    detailEl.hidden = false;
  }

  rowsEl.addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr');
    if (!tr) return;
    var slug = tr.getAttribute('data-slug');
    showDetail(selected === slug ? '' : slug);
    render();
    if (selected) detailEl.scrollIntoView({ block: 'nearest' });
  });
  [qEl, scopeEl, catEl, chainEl, sortEl].forEach(function (el) {
    el.addEventListener('input', function () { render(); });
    el.addEventListener('change', function () { render(); });
  });

  render();
  if (selected) {
    showDetail(selected);
    detailEl.scrollIntoView();
  }
})();
