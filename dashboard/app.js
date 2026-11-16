// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail view with the
// model's own inputs and the protocol's farm plan, a live-token view, and a model sandbox
// that re-scores the board under the reader's own constants. No network: every byte it
// shows is in data.js. No URL appears anywhere in this file.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = {
    q: '', category: 'all', chain: 'all', tvl: 0, tab: 'board',
    sort: 'implied', dir: -1, selected: null,
    custom: null
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function, the same arithmetic lib/model.ts runs: the page recomputes a
  // row from the snapshot figures and checks the number board.json carries, so the page's
  // code and the board's data are visibly the same function.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chains = row.chains ? row.chains.length : 0;
    var breadth = 1 + model.breadth_weight * Math.min(Math.max(chains - 1, 0), model.breadth_cap);
    return {
      implied: Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity * breadth)),
      growth: growth, growthMult: growthMult, maturity: maturity, breadth: breadth
    };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains,
  // TVL and age decide the action, the capital, the hold and every cost and time. The gas
  // follows the chain, never the protocol's name. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasOn(chain) {
    var c = (chain || '').toLowerCase();
    if (c === 'ethereum') return 6;
    if (c === 'bitcoin') return 2;
    return 1;
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 200;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('money market') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and borrow a small amount against it, then repay.';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-TVL vault on " + chain + ' and keep the shares.';
    if (c.indexOf('curator') >= 0 || c.indexOf('risk curator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' curator vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('allocator') >= 0 || c.indexOf('asset management') >= 0 || c.indexOf('onchain capital') >= 0) return 'Allocate $' + capital + ' to a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one small position on a ' + name + ' market that settles after 7 days.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('real world') >= 0) return 'Mint $' + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it for the full term.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('payment') >= 0) return 'Route $' + capital + ' of payments through ' + name + ' on ' + chain + ' across at least two separate weeks.';
    if (c.indexOf('launchpad') >= 0 || c.indexOf('launch') >= 0) return 'Commit $' + capital + ' to a ' + name + ' launch on ' + chain + ' and hold the allocation.';
    if (c.indexOf('gaming') >= 0 || c.indexOf('game') >= 0) return 'Deposit $' + capital + ' and play at least one session a week on ' + name + ' on ' + chain + '.';
    if (c.indexOf('social') >= 0) return 'Deposit $' + capital + ' and make one qualifying social action a week on ' + name + ' on ' + chain + '.';
    if (c.indexOf('ai') >= 0 || c.indexOf('artificial intelligence') >= 0) return 'Spend $' + capital + " on " + name + "'s AI service on " + chain + ' and keep the receipts.';
    if (c.indexOf('nft') >= 0) return 'Buy or mint with $' + capital + ' through ' + name + ' on ' + chain + ' and hold the asset.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of the ' + name + ' index on ' + chain + ' and hold it.';
    if (c.indexOf('privacy') >= 0) return 'Use $' + capital + " through " + name + "'s private flow on " + chain + ' and keep the receipt.';
    if (c.indexOf('oracle') >= 0) return 'Stake $' + capital + " to secure " + name + "'s feed on " + chain + ' and keep the position.';
    if (c.indexOf('chain') >= 0 && c.indexOf('cross') < 0) return 'Use $' + capital + " of " + name + "'s own chain: bridge in, transact weekly, and keep a balance.";
    if (c.indexOf('cross') >= 0) return 'Move $' + capital + ' across chains through ' + name + ' once a week and keep a balance on each side.';
    if (c.indexOf('vault') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('synthetic') >= 0 || c.indexOf('basis') >= 0) return 'Mint $' + capital + ' of the synthetic asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('farm') >= 0) return 'Deposit $' + capital + " into " + name + "'s farm on " + chain + ' and harvest weekly.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasOn(chain);
    var second = p.chains && p.chains.length > 1 ? p.chains[1] : null;
    var spread = second
      ? { text: 'Repeat the same position on ' + second + ' with half the capital, so the activity is counted on two chains instead of one.', cost: '$' + Math.ceil(capital / 2) + ' of capital and about $' + gasOn(second) + ' of gas', time: '15 minutes to set up' }
      : { text: 'Do a second, different action on the same protocol, such as a swap, a vote or a second deposit, so the wallet shows more than one kind of activity.', cost: 'about $' + gas + ' of gas', time: '10 minutes' };
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'about $' + gas + ' of gas for the first transaction on ' + chain, time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $' + gas + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      spread,
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tvl')) state.tvl = parseInt(params.get('tvl'), 10) || 0;
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tvl) params.set('tvl', String(state.tvl));
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (state.tvl && r.tvl_usd < state.tvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark', 'aria-hidden': 'true' }),
        el('span', { class: 'brand-name' }, 'Token ', el('em', { text: 'Radar' }))
      ),
      el('div', { class: 'top-meta' },
        el('span', { class: 'pill', text: 'Snapshot ' + DATA.as_of }),
        el('span', { class: 'pill', text: 'DefiLlama protocol index' }),
        el('span', { class: 'pill', text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var top = DATA.rows[0];
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, 'Every protocol with no token on record, ranked by ', el('span', { class: 'hl', text: 'implied value' }), '.'),
        el('p', { text: 'The watchlist is the floor: ' + DATA.watchlist_size + ' protocols with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' more pre-token protocols at any size, ranked by the same model. Implied value is a model, not a promise — and never a prediction that a token will be issued.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { class: 'green', text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: fmtUsd(top ? top.implied_value_usd : 0) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function distribution() {
    var counts = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Other';
      counts[c] = (counts[c] || 0) + 1;
    });
    var top = Object.keys(counts).map(function (c) { return { c: c, n: counts[c] }; })
      .sort(function (a, b) { return b.n - a.n || (a.c < b.c ? -1 : 1); }).slice(0, 8);
    var max = top.length ? top[0].n : 1;
    return el('section', { class: 'dist', 'aria-label': 'Protocols by category' },
      el('h2', { text: 'Where the pre-token protocols sit' }),
      el('p', { class: 'sub', text: 'Rows on this board by DefiLlama category — the eight largest.' }),
      top.map(function (t) {
        return el('div', { class: 'dist-row' },
          el('span', { text: t.c }),
          el('div', { class: 'bar-track' }, el('i', { class: 'bar-fill', style: 'width:' + Math.max(2, Math.round((t.n / max) * 100)) + '%' })),
          el('span', { class: 'count', text: String(t.n) })
        );
      })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).slice(0, 18);
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCounts[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var tvlSel = el('select', { id: 'tvl', 'aria-label': 'Minimum TVL' },
      [[0, 'Any TVL'], [5e7, '$50M and up'], [1e8, '$100M and up'], [5e8, '$500M and up'], [1e9, '$1B and up']].map(function (o) {
        return el('option', { value: String(o[0]), text: o[1], selected: state.tvl === o[0] ? 'selected' : null });
      })
    );
    tvlSel.addEventListener('change', function () { state.tvl = parseInt(tvlSel.value, 10) || 0; writeHash(); render(); });
    function tabBtn(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    var shown = state.tab === 'board' ? filteredRows().length : state.tab === 'live' ? DATA.live.length : DATA.rows.length;
    return el('div', { class: 'controls' },
      el('div', { class: 'field grow' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { for: 'tvl', text: 'Min TVL' }), tvlSel),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'View' }),
        el('div', { class: 'tabs' }, tabBtn('board', 'Pre-token'), tabBtn('live', 'Live token'), tabBtn('model', 'Model'))),
      el('span', { class: 'count', text: shown + ' rows shown' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' ↓' : ' ↑' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category, chain or TVL to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.tvl = 0; writeHash(); render(); } })
      ));
    }
    var max = 1;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar-track', 'aria-hidden': 'true' }, el('i', { class: 'bar-fill', style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status pre', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — a board that mixed them would rank a fact against a model.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelExplainer() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { text: 'One function scores every protocol. No name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( TVL x ', el('b', { text: String(m.base_multiple) }), ' x (1 + clamp(7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + ' + m.breadth_weight + ' x min(chains - 1, ' + m.breadth_cap + ')) )'
      ),
      el('p', { text: 'TVL, seven-day growth and chain count come from the snapshot. Age is the time since the protocol was first listed — the best record of how long it has run with no token on record; an unlisted age uses ' + m.unknown_age_days + ' days. Growth is clamped so one wild week cannot decide a rank, and the chain term is capped so one chain-count outlier cannot either.' })
    );
  }

  function modelSandbox() {
    var m = DATA.model;
    var custom = state.custom || m;
    var sandboxRows = DATA.rows.map(function (r) {
      var c = impliedOf(r, custom);
      return { row: r, implied: c.implied };
    }).sort(function (a, b) { return b.implied - a.implied || (a.row.slug < b.row.slug ? -1 : 1); });
    var top = sandboxRows.slice(0, 12);
    var tbody = el('tbody');
    top.forEach(function (s, i) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: String(i + 1) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: s.row.name }), el('span', { class: 'sub', text: (s.row.category || 'Other') }))),
        el('td', { class: 'num', text: fmtUsd(s.implied) }),
        el('td', { class: 'num', text: 'board #' + s.row.rank })
      ));
    });
    function slider(id, label, min, max, step, value, fmt, apply) {
      var out = el('span', { class: 'val', text: fmt(value) });
      var input = el('input', { type: 'range', id: id, min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
      input.addEventListener('input', function () {
        if (!state.custom) state.custom = { base_multiple: m.base_multiple, growth_weight: m.growth_weight, maturity_floor: m.maturity_floor, breadth_weight: m.breadth_weight, growth_floor: m.growth_floor, growth_cap: m.growth_cap, maturity_range: m.maturity_range, maturity_days: m.maturity_days, unknown_age_days: m.unknown_age_days, breadth_cap: m.breadth_cap };
        state.custom[apply] = parseFloat(input.value);
        render();
      });
      return el('div', { class: 'field' }, el('label', { for: id }, label + ' ', out), input);
    }
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset to the board model', onclick: function () { state.custom = null; render(); } });
    return el('div', null,
      modelExplainer(),
      el('section', { class: 'panel model' },
        el('h2', { text: 'Model sandbox — change the constants, re-score the board' }),
        el('p', { text: 'The sandbox runs the same function with your constants and re-ranks all ' + DATA.board_size + ' rows. The board above never changes: this is your what-if, not the entry.' }),
        el('div', { class: 'sandbox' },
          slider('sb-base', 'Launch multiple (TVL x)', 0.05, 1, 0.05, custom.base_multiple, function (v) { return 'x' + v.toFixed(2); }, 'base_multiple'),
          slider('sb-growth', 'Growth weight', 0, 1.5, 0.1, custom.growth_weight, function (v) { return 'x' + v.toFixed(1); }, 'growth_weight'),
          slider('sb-mat', 'Maturity floor', 0.3, 0.9, 0.05, custom.maturity_floor, function (v) { return v.toFixed(2); }, 'maturity_floor'),
          slider('sb-breadth', 'Chain breadth weight', 0, 0.1, 0.01, custom.breadth_weight, function (v) { return '+' + v.toFixed(2) + ' / chain'; }, 'breadth_weight')
        ),
        el('p', { class: 'sandbox-note', text: state.custom ? 'Showing your constants. Top of your board: ' + (sandboxRows[0] ? sandboxRows[0].row.name + ' at ' + fmtUsd(sandboxRows[0].implied) : '—') + '.' : 'Showing the board model. Move a slider to re-score.' }),
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'New rank' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'Implied value' }), el('th', { scope: 'col', text: 'Board rank' }))),
            tbody
          )
        ),
        el('div', { style: 'margin-top:12px' }, reset)
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var calc = impliedOf(row, DATA.model);
    var match = calc.implied === row.implied_value_usd;
    var steps = farmSteps(row);
    var inner = el('div', { class: 'detail-inner' });
    inner.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'rankline', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · no token on record' }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    inner.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value — the model, line by line' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String(row.chains ? row.chains.length : 0) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Breadth multiplier' }), el('b', { class: 'num', text: String(row.breadth_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(calc.implied) + (match ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price, and never a prediction that a token will be issued.' })
    ));
    inner.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    var whyParts = [];
    whyParts.push(row.name + ' ranks #' + row.rank + ' because its TVL of ' + fmtUsd(row.tvl_usd) + ' is the largest input to the model');
    whyParts.push(row.change_7d === null ? 'its seven-day growth is unreported, so the model counts it as flat' : 'its seven-day growth of ' + fmtPct(row.change_7d) + (calc.growthMult >= 1 ? ' lifts it' : ' pulls it down'));
    whyParts.push(row.age_days === null ? 'its age is unlisted, so the model counts 365 days' : 'it has run ' + fmtAge(row.age_days) + ' with no token on record');
    whyParts.push('and it is live on ' + (row.chains ? row.chains.length : 0) + ' chain' + ((row.chains ? row.chains.length : 0) === 1 ? '' : 's') + '.');
    inner.appendChild(el('div', { class: 'why' }, el('b', { text: 'Why this rank. ' }), whyParts.join(', ') + ' Change any of those figures and the rank moves — try it in the Model tab.'));
    dialog.textContent = '';
    dialog.appendChild(inner);
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('p', null, el('b', { text: 'What this board is. ' }), 'A model of what a token would be worth if a protocol’s record stayed as it is. It does not predict whether or when a token is issued, and its implied value is this entry’s own claim.'),
      el('p', null, el('b', { text: 'What “no token” means. ' }), 'The snapshot records no token for a protocol on this board — no market cap, no CoinGecko id, no symbol. That is DefiLlama’s record, not proof: a protocol may still have a token its record does not carry.'),
      el('p', { text: 'Data: DefiLlama protocol index, snapshot ' + DATA.as_of + '. Model ' + DATA.model_version + '. ' + DATA.board_size + ' pre-token rows, ' + DATA.watchlist_size + ' of them on the watchlist, ' + DATA.live_size + ' live-token protocols set aside.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(distribution());
    shell.appendChild(controls());
    if (state.tab === 'live') shell.appendChild(liveTable());
    else if (state.tab === 'model') shell.appendChild(modelSandbox());
    else shell.appendChild(boardTable());
    if (state.tab === 'board') shell.appendChild(modelExplainer());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
