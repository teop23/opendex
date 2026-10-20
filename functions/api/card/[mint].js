import { getCard, json, MINT_RE } from '../../_lib/card.js';

export async function onRequestGet({ params, env, request, waitUntil }) {
  const mint = String(params.mint || '').trim();
  if (!MINT_RE.test(mint)) return json({ error: 'not a Solana mint address' }, 400);
  const force = new URL(request.url).searchParams.has('fresh');
  try {
    const r = await getCard(env, mint, { force, ctx: { waitUntil } });
    return json({ ...r.card, cache: { hit: r.cached, ageSeconds: Math.round(r.age / 1000), partial: !!r.partial, error: r.error || null } }, 200, {
      'cache-control': 'public, max-age=60',
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
}
