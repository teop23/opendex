import { readFeed, json } from '../_lib/card.js';

export async function onRequestGet({ env, request }) {
  const n = Math.min(60, Number(new URL(request.url).searchParams.get('limit')) || 30);
  try {
    return json(await readFeed(env, n), 200, { 'cache-control': 'public, max-age=30' });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
}
