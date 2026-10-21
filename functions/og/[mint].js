/* /og/<mint>.png: 1200x630 link-preview card rendered at the edge from the cached card. */
import { ImageResponse, loadGoogleFont } from 'workers-og';
import { getCard, summary, short, MINT_RE } from '../_lib/card.js';

const C = { bg: '#121317', wash: '#1a1b20', ink: '#eef0f4', ink2: '#a3a8b5', line: '#3a3d47', acc: '#6fe49b', bad: '#f0796b' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtUsd = (n) => (n == null ? null : n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K' : '$' + Number(n).toFixed(2));

async function font(env, weight) {
  const key = `font:jbm:${weight}`;
  const hit = await env.OPENDEX_CACHE.get(key, 'arrayBuffer');
  if (hit) return hit;
  const buf = await loadGoogleFont({ family: 'JetBrains Mono', weight });
  await env.OPENDEX_CACHE.put(key, buf, { expirationTtl: 30 * 24 * 3600 });
  return buf;
}

/* Token image as a data URL so the renderer never waits on an IPFS gateway. */
async function imageData(url) {
  if (!url) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3500);
    const r = await fetch(url, { signal: ctl.signal, headers: { accept: 'image/*' } });
    clearTimeout(t);
    if (!r.ok) return null;
    const type = r.headers.get('content-type') || 'image/png';
    if (!/^image\/(png|jpe?g|gif|webp)/.test(type)) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    if (b.length > 2_000_000) return null;
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return `data:${type};base64,${btoa(s)}`;
  } catch (e) {
    return null;
  }
}

const chip = (label, value, tone) =>
  `<div style="display:flex;align-items:baseline;gap:10px;padding:12px 16px;border:1px solid ${C.line};background:${C.wash};border-radius:6px;font-size:20px">
     <span style="color:${C.ink2}">${esc(label)}</span><span style="color:${tone};font-weight:700">${esc(value)}</span>
   </div>`;

function html(s, img, mint) {
  const tone = s.verdict === 'failed' ? C.bad : s.verdict === 'none' ? C.ink2 : C.acc;
  const sub = s.verdict === 'failed' ? 'an on-chain claim in the creator memo does not check out'
    : s.verdict === 'verified' ? 'creator wallet published links and claims that check out on-chain'
    : s.verdict === 'signed' ? 'the deployer wallet signed its links; nothing else is vouched for'
    : 'no opendex memo from the creator wallet';
  const chips = [
    s.mintRevoked === null ? null : chip('mint', s.mintRevoked ? 'revoked' : 'LIVE', s.mintRevoked ? C.acc : C.bad),
    s.freezeRevoked === null ? null : chip('freeze', s.freezeRevoked ? 'revoked' : 'LIVE', s.freezeRevoked ? C.acc : C.bad),
    s.onCurve ? chip('LP', `${s.launchpad} curve`, C.ink) : s.lpLockedPct == null ? null : chip('LP locked', s.lpLockedPct.toFixed(0) + '%', s.lpLockedPct >= 90 ? C.acc : C.ink),
    s.risk == null ? null : chip('rugcheck risk', `${s.risk}/100`, s.riskFlags ? C.bad : C.acc),
    s.holders == null ? null : chip('holders', s.holders.toLocaleString('en-US'), C.ink),
  ].filter(Boolean).join('');
  const links = s.signedLinks.length ? 'creator-signed: ' + s.signedLinks.join(' · ') : s.launchLinks.length ? 'self-reported at launch: ' + s.launchLinks.join(' · ') : 'none on-chain';
  const receipt = s.paid ? `Dexscreener receipt: paid ${String(s.paidAt).slice(0, 10)}` : 'no Dexscreener receipt';
  const sym = s.symbol ? '$' + esc(s.symbol) : esc(short(mint));
  return `
  <div style="display:flex;flex-direction:column;width:1200px;height:630px;background:${C.bg};color:${C.ink};font-family:'JetBrains Mono';padding:48px 56px">
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:24px">
      <span style="display:flex;font-weight:700">opendex</span>
      <span style="color:${C.ink2}">opendex.info/t/${esc(short(mint))}</span>
    </div>
    <div style="display:flex;align-items:center;gap:20px;margin-top:38px">
      ${img ? `<img src="${img}" width="72" height="72" style="border-radius:8px;object-fit:cover" />` : `<div style="display:flex;width:72px;height:72px;border-radius:8px;background:${C.wash};border:1px solid ${C.line}"></div>`}
      <div style="display:flex;flex-direction:column">
        <div style="display:flex;align-items:baseline;gap:14px;font-size:40px;font-weight:700">${sym}<span style="font-size:24px;font-weight:400;color:${C.ink2}">${esc(s.name && s.name !== s.symbol ? s.name : '')}</span></div>
        <div style="display:flex;gap:18px;font-size:22px;color:${C.ink2}">${[s.mcap != null ? 'mcap ' + fmtUsd(s.mcap) : null, s.verified ? 'jupiter verified' : null].filter(Boolean).map(esc).join(' · ')}</div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;margin-top:34px">
      <div style="display:flex;font-size:64px;font-weight:700;line-height:1;color:${tone};letter-spacing:-0.02em">${esc(s.verdictText)}</div>
      <div style="display:flex;font-size:24px;color:${C.ink2};margin-top:12px">${esc(sub)}</div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:30px">${chips}</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:26px;font-size:22px">
      <div style="display:flex;gap:12px"><span style="color:${C.ink2}">links</span><span>${esc(links)}</span></div>
      <div style="display:flex;color:${C.ink2}">${esc(receipt)}</div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:auto;padding-top:22px;border-top:1px solid ${C.line};font-size:22px;color:${C.ink2}">
      <span style="color:${C.ink}">Who signed, not who paid. Not a safety score.</span>
      <span>${esc(String(s.at).slice(0, 16).replace('T', ' '))} UTC</span>
    </div>
  </div>`;
}

export async function onRequestGet({ params, env, waitUntil }) {
  const mint = String(params.mint || '').replace(/\.png$/i, '').trim();
  if (!MINT_RE.test(mint)) return new Response('not a mint', { status: 400 });
  try {
    const [{ card }, f400, f700] = await Promise.all([getCard(env, mint, { ctx: { waitUntil } }), font(env, 400), font(env, 700)]);
    if (!card.chain && /^not a token/.test((card.errors && card.errors.chain) || '')) return Response.redirect(new URL('/og.png', 'https://opendex.info').href, 302);
    const s = summary(card);
    const img = await imageData(s.image);
    const markup = html(s, img, mint).replace(/>\s+</g, '><').trim();
    const res = new ImageResponse(markup, {
      width: 1200,
      height: 630,
      format: 'png',
      fonts: [
        { name: 'JetBrains Mono', data: f400, weight: 400, style: 'normal' },
        { name: 'JetBrains Mono', data: f700, weight: 700, style: 'normal' },
      ],
    });
    // the renderer marks images immutable for a year; these carry live numbers, so keep them for 5 minutes
    const h = new Headers(res.headers);
    h.set('cache-control', 'public, max-age=300');
    return new Response(res.body, { status: res.status, headers: h });
  } catch (e) {
    return new Response('og: ' + String(e.message || e), { status: 502 });
  }
}
