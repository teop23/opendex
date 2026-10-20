/* /t/<mint>: the same page as /, with per-token meta tags injected so a shared link unfurls as a card. */
import { getCard, summary, short, MINT_RE } from '../_lib/card.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function onRequestGet({ params, env, request, waitUntil }) {
  const mint = String(params.mint || '').trim();
  const origin = env.SITE_ORIGIN || new URL(request.url).origin;
  const shell = await env.ASSETS.fetch(new Request(new URL('/', request.url), { headers: request.headers }));
  if (!MINT_RE.test(mint)) return shell;
  let html = await shell.text();

  let title = `opendex · ${short(mint)}`;
  let desc = 'Trust card built from on-chain metadata and public APIs. Who signed, not who paid.';
  try {
    const { card } = await getCard(env, mint, { ctx: { waitUntil } });
    const s = summary(card);
    const sym = s.symbol ? '$' + s.symbol : short(mint);
    title = `${s.verdictText}: ${sym}${s.name && s.name !== s.symbol ? ', ' + s.name : ''} · opendex`;
    const facts = [
      s.mintAuthority === null ? null : `mint ${s.mintAuthority ? 'revoked' : 'LIVE'}`,
      s.freezeAuthority === null ? null : `freeze ${s.freezeAuthority ? 'revoked' : 'LIVE'}`,
      s.lpLockedPct == null ? null : `LP locked ${s.lpLockedPct.toFixed(0)}%`,
      s.risk == null ? null : `rugcheck ${s.risk}/100`,
      s.holders == null ? null : `${s.holders.toLocaleString('en-US')} holders`,
      s.links.length ? `links on-chain: ${s.links.join(', ')}` : 'no links on-chain',
      s.paid ? `Dexscreener receipt ${String(s.paidAt).slice(0, 10)}` : 'no Dexscreener receipt',
    ].filter(Boolean);
    desc = facts.join(' · ');
  } catch (e) {
    /* meta falls back to the generic text; the page itself still builds in the browser */
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
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${origin}/og/${mint}.png">`,
  ].join('\n');
  html = html.replace(/<!--og-->[\s\S]*?<!--\/og-->/, tags);

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' },
  });
}
