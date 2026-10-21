/* /t/<mint>: the same page as /, with per-token meta tags injected so a shared link unfurls as a card. */
import { getCard, summary, short, MINT_RE } from '../_lib/card.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function onRequestGet({ params, env, request, waitUntil }) {
  const mint = String(params.mint || '').trim();
  const origin = env.SITE_ORIGIN || new URL(request.url).origin;
  const shell = await env.ASSETS.fetch(new Request(new URL('/', request.url), { headers: request.headers }));
  if (!MINT_RE.test(mint)) return new Response(shell.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' } });
  let html = await shell.text();

  let title = `opendex · ${short(mint)}`;
  let desc = 'Trust card built from on-chain metadata and public APIs. Who signed, not who paid.';
  try {
    const { card } = await getCard(env, mint, { ctx: { waitUntil } });
    if (!card.chain && /^not a token/.test((card.errors && card.errors.chain) || '')) throw Object.assign(new Error('not a token'), { notToken: true });
    const s = summary(card);
    const symbol = String(s.symbol || '').trim().replace(/^\$+/, ''), name = String(s.name || '').trim();
    const sym = symbol ? '$' + symbol : short(mint);
    title = `${s.verdictText}: ${sym}${name && name.toLowerCase() !== symbol.toLowerCase() ? ', ' + name : ''} · opendex`;
    const facts = [
      s.mintRevoked == null ? null : `mint ${s.mintRevoked ? 'revoked' : 'LIVE'}`,
      s.freezeRevoked == null ? null : `freeze ${s.freezeRevoked ? 'revoked' : 'LIVE'}`,
      s.onCurve ? `on the ${s.launchpad} curve, no LP yet` : s.lpLockedPct == null ? null : `LP locked ${s.lpLockedPct.toFixed(0)}%`,
      s.risk == null ? null : `rugcheck risk ${s.risk}/100`,
      s.holders == null ? null : `${s.holders.toLocaleString('en-US')} holders`,
      s.launchLinks.length ? `launch links: ${s.launchLinks.join(', ')}` : 'no launch links',
      s.signedLinks.length ? `creator-signed: ${s.signedLinks.join(', ')}` : null,
      s.paid ? `Dexscreener receipt ${String(s.paidAt).slice(0, 10)}` : 'no Dexscreener receipt',
    ].filter(Boolean);
    desc = facts.join(' · ') + '. Not a safety score.';
  } catch (e) {
    /* meta falls back to the generic text; the page itself still builds in the browser */
    if (e.notToken) { title = `Not a token mint: ${short(mint)} · opendex`; desc = 'This address is a wallet or program, not a token mint. opendex reads tokens only.'; }
  }

  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<link rel="canonical" href="${origin}/t/${mint}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="opendex">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${origin}/t/${mint}">`,
    `<meta property="og:image" content="${origin}/og/${mint}.png">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:site" content="@opendexinfo">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${origin}/og/${mint}.png">`,
  ].join('\n');
  html = html.replace(/<!--og-->[\s\S]*?<!--\/og-->/, tags);

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' },
  });
}
