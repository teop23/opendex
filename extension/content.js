/* opendex content script: injects a free trust strip on dexscreener.com/solana/<pair-or-mint> pages. */
(() => {
  'use strict';
  const ROOT_ID = 'opendex-strip';
  let current = null;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const short = (a) => (a ? a.slice(0, 4) + '…' + a.slice(-4) : '');
  const LABEL = { twitter: 'X', telegram: 'Telegram', website: 'Website', discord: 'Discord', github: 'GitHub' };

  const getRpc = () =>
    new Promise((res) => {
      try {
        chrome.storage.sync.get({ rpc: '' }, (v) => res(v.rpc || undefined));
      } catch (e) {
        res(undefined);
      }
    });

  /* The URL carries a pair address or a mint. Resolve to the base token mint via Dexscreener's public API. */
  async function resolveMint(id) {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${id}`).then((x) => x.json()).catch(() => null);
    const p = r && r.pairs && r.pairs[0];
    if (p && p.baseToken && p.baseToken.address) return p.baseToken.address;
    const t = await fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${id}`).then((x) => x.json()).catch(() => null);
    if (Array.isArray(t) && t[0] && t[0].baseToken) return t[0].baseToken.address;
    return id;
  }

  function mount() {
    let el = document.getElementById(ROOT_ID);
    if (el) return el;
    el = document.createElement('aside');
    el.id = ROOT_ID;
    document.body.appendChild(el);
    return el;
  }

  function render(el, c) {
    const ch = c.chain, j = c.jup, r = c.rug, d = c.dex;
    const soc = Object.entries(c.socials || {});
    const items = [];
    items.push(soc.length
      ? `<span class="df-ok">on-chain socials</span> ${soc.map(([k, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener nofollow">${esc(LABEL[k] || k)}</a>`).join('')}`
      : `<span class="df-bad">no socials in launch metadata</span>`);
    if (c.creator) {
      const cl = c.creator.claims ? Object.entries(c.creator.claims).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => ({ k, ...x }))) : [];
      const failed = cl.filter((x) => x.ok === false).length;
      items.push(`<span class="df-ok">creator-signed update</span> <a href="https://solscan.io/tx/${esc(c.creator.signature)}" target="_blank" rel="noopener">tx ${esc(short(c.creator.signature))}</a>` +
        (cl.length ? ` · claims ${cl.length - failed}/${cl.length} verified` + (failed ? ` <span class="df-bad">(${failed} FAILED: skip)</span>` : '') : ' <span class="df-muted">(links only, no on-chain claims)</span>'));
    }
    if (j) {
      items.push(`${j.verified ? '<span class="df-ok">Jupiter verified</span>' : '<span class="df-muted">not Jupiter verified</span>'} · organic ${j.organicScore == null ? '—' : Math.round(j.organicScore)} · holders ${j.holders ?? '—'} · dev mints ${j.audit && j.audit.devMints != null ? j.audit.devMints : '—'}`);
      const ok = j.audit && j.audit.mintAuthorityDisabled && j.audit.freezeAuthorityDisabled;
      items.push(ok ? '<span class="df-ok">mint &amp; freeze revoked</span>' : '<span class="df-bad">mint or freeze authority live</span>');
    }
    if (r) items.push(`rugcheck ${r.score ?? '—'}/100 · LP locked ${r.lpLockedPct == null ? '—' : r.lpLockedPct.toFixed(0) + '%'}${r.risks.length ? ' · ' + esc(r.risks.map((x) => x.name).join(', ')) : ''}`);
    if (d) items.push(d.paid ? `<span class="df-muted">Dexscreener receipt: $299 paid ${c.dex.paidAt ? c.dex.paidAt.toISOString().slice(0, 10) : ''}</span>` : `<span class="df-muted">Dexscreener receipt: none (links above are the same ones it would show after payment)</span>`);
    el.innerHTML = `
      <div class="df-head"><b>opendex</b><span class="df-mono">${esc(short(c.mint))}</span><button type="button" class="df-x" aria-label="close">×</button></div>
      <ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
    el.querySelector('.df-x').addEventListener('click', () => el.remove());
  }

  async function run() {
    const m = location.pathname.match(/^\/solana\/([1-9A-HJ-NP-Za-km-z]{32,44})/);
    if (!m) return;
    if (current === m[1]) return;
    current = m[1];
    const el = mount();
    el.innerHTML = `<div class="df-head"><b>opendex</b><span class="df-muted">reading chain…</span></div>`;
    try {
      const mint = await resolveMint(m[1]);
      const card = await OpenDex.build(mint, { rpc: await getRpc(), maxMemoTx: 15 });
      if (current !== m[1]) return;
      render(el, card);
    } catch (e) {
      el.innerHTML = `<div class="df-head"><b>opendex</b><span class="df-bad">${esc(e.message || e)}</span></div>`;
    }
  }

  run();
  /* Dexscreener is an SPA: watch URL changes. */
  let last = location.href;
  setInterval(() => {
    if (location.href !== last) {
      last = location.href;
      current = null;
      run();
    }
  }, 800);
})();
