/* Shared by the Pages Functions: builds a card with the same core the browser uses,
   caches it in KV and keeps a short "recently checked" list. */
import '../../web/opendex-core.js';

const OpenDex = globalThis.OpenDex;
export const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const FRESH_MS = 10 * 60 * 1000; // serve from cache for 10 minutes
const KEEP_S = 7 * 24 * 3600; // keep stale copies a week as a fallback
const FEED_MAX = 60;

export const short = (a) => (a ? String(a).slice(0, 4) + '…' + String(a).slice(-4) : '');

/* One line that says what the creator did, nothing about whether the token is good. */
export function verdict(card) {
  const cr = card.creator;
  if (!cr) return { key: 'none', text: 'NO SIGNED LINKS', detail: 'creator has not published an opendex memo' };
  const flat = Object.values(cr.claims || {}).flatMap((v) => (Array.isArray(v) ? v : [v]));
  const checked = flat.filter((x) => x.ok === true || x.ok === false);
  const failed = checked.filter((x) => x.ok === false).length;
  if (failed) return { key: 'failed', text: 'CLAIM FAILED', detail: `${failed} of ${checked.length} on-chain claims do not check out` };
  if (checked.length) return { key: 'verified', text: 'CREATOR SIGNED', detail: `${checked.length}/${checked.length} claims verified on-chain` };
  return { key: 'signed', text: 'CREATOR SIGNED', detail: 'links only, no on-chain claims' };
}

export function summary(card) {
  const ch = card.chain || {}, j = card.jup || {}, r = card.rug || {}, d = card.dex || {};
  const v = verdict(card);
  return {
    mint: card.mint,
    symbol: ch.symbol || (j.raw && j.raw.symbol) || '',
    name: ch.name || (j.raw && j.raw.name) || '',
    image: ch.image || (j.raw && j.raw.icon) || null,
    verdict: v.key,
    verdictText: v.text,
    creatorWallet: card.creatorWallet || null,
    creatorSource: card.creatorSource || null,
    signer: (card.creator && card.creator.signer) || null, // always equals creatorWallet when a memo is shown
    signedAt: (card.creator && card.creator.at) || null,
    signature: (card.creator && card.creator.signature) || null,
    mintRevoked: j.audit ? !!j.audit.mintAuthorityDisabled : ch.mintAuthority === null ? true : ch.mintAuthority ? false : null,
    freezeRevoked: j.audit ? !!j.audit.freezeAuthorityDisabled : ch.freezeAuthority === null ? true : ch.freezeAuthority ? false : null,
    lpLockedPct: r.lpLockedPct ?? null,
    risk: r.score ?? null,
    riskFlags: (r.risks || []).length,
    holders: j.holders ?? null,
    mcap: j.mcap ?? null,
    verified: !!j.verified,
    links: Object.keys(card.socials || {}),
    paid: !!d.paid,
    paidAt: d.paidAt || null,
    at: card.builtAt,
  };
}

async function pushFeed(env, card) {
  const s = summary(card);
  let list = [];
  try { list = (await env.OPENDEX_CACHE.get('feed', 'json')) || []; } catch (e) { /* first run */ }
  list = [s, ...list.filter((x) => x.mint !== s.mint)].slice(0, FEED_MAX);
  await env.OPENDEX_CACHE.put('feed', JSON.stringify(list));
}

export async function readFeed(env, limit = 30) {
  const list = (await env.OPENDEX_CACHE.get('feed', 'json')) || [];
  return list.slice(0, limit);
}

/* Returns { card, cached: bool, age: ms }. Throws only when there is neither a fresh build nor a stale copy. */
export async function getCard(env, mint, { force = false, ctx } = {}) {
  if (!MINT_RE.test(mint)) throw new Error('not a Solana mint address');
  const key = 'card:' + mint;
  const stale = await env.OPENDEX_CACHE.get(key, 'json');
  const age = stale ? Date.now() - Date.parse(stale.builtAt) : Infinity;
  if (stale && !force && age < FRESH_MS) return { card: stale, cached: true, age };
  try {
    // Public RPCs rate-limit Cloudflare's shared egress; try each configured one until the chain read succeeds.
    const rpcs = String(env.RPC_URLS || env.RPC_URL || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (!rpcs.length) rpcs.push(undefined);
    let card = null;
    for (const rpc of rpcs) {
      card = await OpenDex.build(mint, { rpc, maxMemoTx: 25 });
      if (card.chain && !card.errors.chain) break;
    }
    // Cache and list only complete reads: a throttled Jupiter or RPC answer would otherwise stick for 10 minutes.
    const complete = !!card.chain && !card.errors.chain && !card.errors.jup && !card.errors.creator;
    const json = JSON.stringify(card);
    if (complete) {
      const writes = Promise.all([env.OPENDEX_CACHE.put(key, json, { expirationTtl: KEEP_S }), pushFeed(env, card)]);
      if (ctx) ctx.waitUntil(writes); else await writes;
    }
    return { card: JSON.parse(json), cached: false, age: 0, partial: !complete };
  } catch (e) {
    if (stale) return { card: stale, cached: true, age, error: String(e.message || e) };
    throw e;
  }
}

export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', ...extra },
  });
