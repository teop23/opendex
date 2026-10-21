/* opendex core: builds a trust card for a Solana mint from free public sources only.
   Used by web/index.html and extension/content.js. No build step, no server. */
(function (root) {
  'use strict';

  const DEFAULT_RPC = 'https://solana-rpc.publicnode.com'; // browser-friendly (CORS), no DAS
  const METAPLEX = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
  const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const TOKEN_LEGACY = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
  const MEMO_PREFIX = 'opendex:v1:';
  /* Canonical inbox: sha256('opendex:inbox:v1:2'), off the ed25519 curve, so no private key exists for it.
     Publishing transactions include a 0-lamport transfer to it; getSignaturesForAddress(INBOX) is then a free global feed. */
  const INBOX = 'FGzq3zKAY18ifGNsKmHdbPo262FSQtnGoDdy8HRQpYSj';
  const IPFS_GATEWAYS = [
    (cid) => `https://pump.mypinata.cloud/ipfs/${cid}`,
    (cid) => `https://ipfs.io/ipfs/${cid}`,
    (cid) => `https://${cid}.ipfs.w3s.link/`,
    (cid) => `https://dweb.link/ipfs/${cid}`,
    (cid) => `https://gateway.pinata.cloud/ipfs/${cid}`,
  ];
  const SOCIAL_KEYS = ['twitter', 'telegram', 'website', 'discord', 'github'];

  const fetchJson = async (url, init, timeoutMs = 12000) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { ...init, signal: ctl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  };

  /* RPC calls run in the user's browser, so public endpoints rate-limit per visitor IP rather than
     per site. On HTTP 429 wait and retry a couple of times before giving up. */
  const rpc = async (url, method, params, tries = 3) => {
    for (let i = 0; ; i++) {
      try {
        const j = await fetchJson(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        });
        if (j.error) throw new Error(`${method}: ${j.error.message}`);
        return j.result;
      } catch (e) {
        if (i + 1 >= tries || !/HTTP 429/.test(String(e.message))) throw e;
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
      }
    }
  };

  const ipfsCid = (uri) => {
    if (!uri) return null;
    const m = uri.match(/\/ipfs\/([A-Za-z0-9]+)/) || uri.match(/^ipfs:\/\/([A-Za-z0-9]+)/);
    return m ? m[1] : null;
  };

  async function fetchMetadataJson(uri) {
    const cid = ipfsCid(uri);
    const candidates = cid ? IPFS_GATEWAYS.map((g) => g(cid)) : [uri];
    let lastErr;
    for (const u of candidates) {
      try {
        const j = await fetchJson(u, { headers: { accept: 'application/json' } }, 8000);
        if (j && typeof j === 'object') return { json: j, url: u, cid };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('metadata unreachable');
  }

  const normalizeLink = (key, v) => {
    if (!v || typeof v !== 'string') return null;
    v = v.trim();
    if (!v) return null;
    if (!/^https?:\/\//i.test(v)) {
      if (key === 'twitter') v = 'https://x.com/' + v.replace(/^@/, '');
      else if (key === 'telegram') v = 'https://t.me/' + v.replace(/^@/, '');
      else v = 'https://' + v;
    }
    return v;
  };

  const pickSocials = (obj) => {
    const out = {};
    for (const k of SOCIAL_KEYS) {
      const v = normalizeLink(k, obj[k]);
      if (v) out[k] = v;
    }
    // Metaplex "extensions" / "properties" variants some launchpads use
    const ext = obj.extensions || obj.properties || {};
    for (const k of SOCIAL_KEYS) if (!out[k] && ext[k]) out[k] = normalizeLink(k, ext[k]);
    if (!out.website && obj.external_url) out.website = normalizeLink('website', obj.external_url);
    return out;
  };


  /* ---- vanilla base58 / ed25519 helpers so we can derive the Metaplex metadata PDA without web3.js ---- */
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const b58decode = (s) => {
    let n = 0n;
    for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); }
    const out = new Uint8Array(32);
    for (let i = 31; i >= 0; i--) { out[i] = Number(n & 255n); n >>= 8n; }
    return out;
  };
  const b58encode = (bytes) => {
    let n = 0n;
    for (const b of bytes) n = (n << 8n) | BigInt(b);
    let s = '';
    while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
    for (const b of bytes) { if (b === 0) s = '1' + s; else break; }
    return s;
  };
  const P = (1n << 255n) - 19n;
  const modpow = (b, e, m) => { let r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return r; };
  const D = (P - (121665n * modpow(121666n, P - 2n, P)) % P) % P;
  const SQRT_M1 = modpow(2n, (P - 1n) / 4n, P);
  const onCurve = (bytes) => {
    let y = 0n;
    for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(bytes[i]);
    y &= (1n << 255n) - 1n;
    if (y >= P) return false;
    const y2 = (y * y) % P;
    const x2 = ((y2 - 1n + P) % P) * modpow((D * y2 + 1n) % P, P - 2n, P) % P;
    let x = modpow(x2, (P + 3n) / 8n, P);
    if ((x * x - x2) % P !== 0n) x = (x * SQRT_M1) % P;
    return ((x * x - x2) % P + P) % P === 0n;
  };
  const sha256 = async (bytes) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const concat = (...arrs) => { const n = arrs.reduce((s, a) => s + a.length, 0); const o = new Uint8Array(n); let i = 0; for (const a of arrs) { o.set(a, i); i += a.length; } return o; };
  async function metadataPda(mint) {
    const prog = b58decode(METAPLEX), m = b58decode(mint), enc = new TextEncoder();
    for (let bump = 255; bump >= 0; bump--) {
      const h = await sha256(concat(enc.encode('metadata'), prog, m, new Uint8Array([bump]), prog, enc.encode('ProgramDerivedAddress')));
      if (!onCurve(h)) return b58encode(h);
    }
    throw new Error('no PDA');
  }
  const parseMetaplex = (raw) => {
    const dv = new DataView(raw.buffer, raw.byteOffset);
    let off = 65;
    const str = () => { const l = dv.getUint32(off, true); const s = new TextDecoder().decode(raw.subarray(off + 4, off + 4 + l)).replace(/\0+$/, ''); off += 4 + l; return s; };
    const name = str(), symbol = str(), uri = str();
    off += 2; // seller fee bps
    if (raw[off++]) { const n = dv.getUint32(off, true); off += 4 + 34 * n; }
    off += 1; // primary sale happened
    const isMutable = !!raw[off];
    return { updateAuthority: b58encode(raw.subarray(1, 33)), name, symbol, uri, isMutable };
  };

  /* Raw path: works on any standard RPC (no DAS). Token-2022 metadata lives on the mint; legacy tokens use the Metaplex PDA. */
  async function onChainRaw(mint, rpcUrl) {
    const acc = await rpc(rpcUrl, 'getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
    if (!acc || !acc.value) throw new Error('not a token: no account exists at this address');
    const v = acc.value, info = (v.data && v.data.parsed && v.data.parsed.info) || {};
    if ((v.owner !== TOKEN_LEGACY && v.owner !== TOKEN_2022) || (v.data && v.data.parsed && v.data.parsed.type !== 'mint')) throw new Error('not a token: this address is not a token mint');
    const base = { tokenProgram: v.owner, supply: info.supply, decimals: info.decimals, mintAuthority: info.mintAuthority || null, freezeAuthority: info.freezeAuthority || null };
    if (v.owner === TOKEN_2022) {
      const ext = (info.extensions || []).find((e) => e.extension === 'tokenMetadata');
      if (ext && ext.state) return { ...base, name: ext.state.name, symbol: ext.state.symbol, jsonUri: ext.state.uri, updateAuthority: ext.state.updateAuthority || null };
    }
    const pda = await metadataPda(mint);
    const md = await rpc(rpcUrl, 'getAccountInfo', [pda, { encoding: 'base64' }]);
    if (!md || !md.value) return { ...base, name: '', symbol: '', jsonUri: null, updateAuthority: null };
    const raw = Uint8Array.from(atob(md.value.data[0]), (c) => c.charCodeAt(0));
    const m = parseMetaplex(raw);
    return { ...base, name: m.name, symbol: m.symbol, jsonUri: m.uri, updateAuthority: m.isMutable ? m.updateAuthority : null, metaplexMutable: m.isMutable };
  }

  async function onChainDas(mint, rpcUrl) {
    const a = await rpc(rpcUrl, 'getAsset', { id: mint });
    // DAS answers for wallets and programs too; only a fungible token carries token_info
    if (!a || !a.token_info) throw new Error('DAS: no token_info');
    const c = a.content || {};
    const ext = (a.mint_extensions && a.mint_extensions.metadata) || {};
    const updateAuthority =
      ext.update_authority || (a.authorities && a.authorities[0] && a.authorities[0].address) || null;
    return {
      name: (c.metadata && c.metadata.name) || ext.name || '',
      symbol: (c.metadata && c.metadata.symbol) || ext.symbol || '',
      image: (c.links && c.links.image) || null,
      jsonUri: c.json_uri || ext.uri || null,
      tokenProgram: a.token_info && a.token_info.token_program,
      supply: a.token_info && a.token_info.supply,
      decimals: a.token_info && a.token_info.decimals,
      updateAuthority,
    };
  }

  async function onChain(mint, rpcUrl) {
    let base, source = 'das';
    try {
      base = await onChainDas(mint, rpcUrl);
    } catch (e) {
      source = 'raw';
      base = await onChainRaw(mint, rpcUrl);
    }
    const res = { image: null, ...base, source, immutable: !base.updateAuthority, socials: {}, metadataUrl: null, cid: null, error: null };
    if (res.jsonUri) {
      try {
        const m = await fetchMetadataJson(res.jsonUri);
        res.socials = pickSocials(m.json);
        res.metadataUrl = m.url;
        res.cid = m.cid;
        if (!res.image && m.json.image) res.image = m.json.image;
        // ipfs.io throttles hotlinked images; route through the gateway that served the JSON
        const icid = ipfsCid(res.image);
        if (icid) res.image = IPFS_GATEWAYS[0](icid);
        res.description = m.json.description || '';
        res.createdOn = m.json.createdOn || null;
      } catch (e) {
        res.error = String(e.message || e);
      }
    }
    return res;
  }

  async function jupiter(mint) {
    const arr = await fetchJson(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`);
    const t = Array.isArray(arr) ? arr.find((x) => x.id === mint) : null;
    if (!t) return null;
    return {
      verified: !!(t.isVerified || (t.tags || []).includes('verified')),
      organicScore: t.organicScore,
      organicLabel: t.organicScoreLabel,
      holders: t.holderCount,
      dev: t.dev || null,
      launchpad: t.launchpad || null,
      graduatedPool: t.graduatedPool || null,
      graduatedAt: t.graduatedAt || null,
      // still on the launchpad's bonding curve: liquidity lives in the curve program, there is no LP token to lock or burn yet
      onCurve: !!t.launchpad && !t.graduatedPool,
      mcap: t.mcap,
      liquidity: t.liquidity,
      audit: t.audit || {},
      tags: t.tags || [],
      firstPool: t.firstPool && t.firstPool.createdAt,
      raw: t,
    };
  }

  async function rugcheck(mint) {
    const r = await fetchJson(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`);
    return {
      score: r.score_normalised,
      risks: (r.risks || []).map((x) => ({ name: x.name, level: x.level, desc: x.description })),
      lpLockedPct: r.lpLockedPct,
    };
  }

  async function dexscreener(mint) {
    const [orders, pairs] = await Promise.all([
      fetchJson(`https://api.dexscreener.com/orders/v1/solana/${mint}`).catch(() => ({ orders: [], boosts: [] })),
      fetchJson(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`).catch(() => []),
    ]);
    const profile = (orders.orders || []).filter((o) => o.type === 'tokenProfile');
    const approved = profile.find((o) => o.status === 'approved');
    const processing = profile.find((o) => o.status === 'processing');
    const cto = (orders.orders || []).find((o) => o.type === 'communityTakeover' && o.status === 'approved');
    const p = Array.isArray(pairs) && pairs.length ? pairs[0] : null;
    return {
      paid: !!approved,
      processing: !!processing && !approved,
      paidAt: approved ? new Date(approved.paymentTimestamp) : null,
      cto: !!cto,
      boosts: (orders.boosts || []).reduce((s, b) => s + (b.amount || 0), 0),
      orders: orders.orders || [],
      pairUrl: p ? p.url : `https://dexscreener.com/solana/${mint}`,
      shownSocials: p && p.info ? p.info : null,
      priceUsd: p ? Number(p.priceUsd) : null,
      liquidityUsd: p && p.liquidity ? p.liquidity.usd : null,
      dexId: p ? p.dexId : null,
    };
  }

  /* Claims are the part of a memo that can be checked on-chain. Self-reported links are not a signal;
     a claim that points to a real burn/lock transaction is. A claim that fails verification is reported as such
     so readers can treat it as a skip flag. */
  const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
  const KEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const shortKey = (a) => (a ? String(a).slice(0, 4) + '…' + String(a).slice(-4) : '');
  async function verifyClaims(claims, dev, rpcUrl) {
    if (!claims || typeof claims !== 'object') return null;
    const out = {};
    const txClaim = async (sig, needBurn) => {
      sig = String(sig);
      if (!SIG_RE.test(sig)) return { value: sig, ok: false, why: 'not a signature' };
      let tx;
      try {
        tx = await rpc(rpcUrl, 'getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 }]);
      } catch (e) {
        return { value: sig, ok: null, why: 'rpc: ' + (e.message || e) };
      }
      if (!tx) return { value: sig, ok: false, why: 'transaction not found' };
      if (tx.meta && tx.meta.err) return { value: sig, ok: false, why: 'transaction failed' };
      const inner = ((tx.meta && tx.meta.innerInstructions) || []).flatMap((i) => i.instructions || []);
      const ixs = [...(tx.transaction.message.instructions || []), ...inner];
      const burn = ixs.find((ix) => (ix.program === 'spl-token' || ix.program === 'spl-token-2022') && ix.parsed && /^burn/.test(ix.parsed.type || ''));
      if (needBurn && !burn) return { value: sig, ok: false, why: 'no token burn in this transaction' };
      const k0 = tx.transaction.message.accountKeys[0];
      const info = burn ? burn.parsed.info : null;
      const amt = info ? (info.amount || (info.tokenAmount && info.tokenAmount.uiAmountString) || '') : '';
      return {
        value: sig,
        ok: true,
        why: burn ? `burned ${amt} of ${shortKey(info.mint || info.account || '')}` : 'transaction confirmed',
        byCreator: (k0 && (k0.pubkey || k0)) === dev,
        at: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
      };
    };
    const acctClaim = async (addr) => {
      addr = String(addr);
      if (!KEY_RE.test(addr)) return { value: addr, ok: false, why: 'not an address' };
      try {
        const a = await rpc(rpcUrl, 'getAccountInfo', [addr, { encoding: 'jsonParsed' }]);
        return a && a.value ? { value: addr, ok: true, why: 'account exists, owner ' + shortKey(a.value.owner) } : { value: addr, ok: false, why: 'account not found' };
      } catch (e) {
        return { value: addr, ok: null, why: 'rpc: ' + (e.message || e) };
      }
    };
    if (claims.lpBurn) out.lpBurn = await txClaim(claims.lpBurn, true);
    if (claims.lpLock) out.lpLock = await txClaim(claims.lpLock, false);
    if (claims.vesting) out.vesting = await acctClaim(claims.vesting);
    if (Array.isArray(claims.devWallets)) {
      out.devWallets = claims.devWallets.slice(0, 10).map((w) => {
        const v = String(w), ok = KEY_RE.test(v);
        return { value: v, ok, why: ok ? 'self-declared' : 'not an address' };
      });
    }
    return Object.keys(out).length ? out : null;
  }

  /* Creator-signed link update: newest memo sent by the creator wallet (fee payer) that starts with opendex:v1: */
  async function creatorUpdate(dev, rpcUrl, maxTx = 25, mint = null) {
    if (!dev) return null;
    const sigs = await rpc(rpcUrl, 'getSignaturesForAddress', [dev, { limit: maxTx }]);
    for (const s of sigs) {
      if (s.err) continue;
      if (s.memo && !s.memo.includes(MEMO_PREFIX)) continue; // cheap pre-filter when RPC returns memo
      let tx;
      try {
        tx = await rpc(rpcUrl, 'getTransaction', [
          s.signature,
          { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 },
        ]);
      } catch (e) {
        continue;
      }
      if (!tx) continue;
      const keys = tx.transaction.message.accountKeys || [];
      const payer = keys[0] && (keys[0].pubkey || keys[0]);
      if (payer !== dev) continue; // only the creator key may publish
      for (const ix of tx.transaction.message.instructions || []) {
        if (ix.program !== 'spl-memo' && ix.programId !== MEMO_PROGRAM) continue;
        const memo = typeof ix.parsed === 'string' ? ix.parsed : null;
        if (!memo || !memo.startsWith(MEMO_PREFIX)) continue;
        try {
          const body = JSON.parse(memo.slice(MEMO_PREFIX.length));
          if (body.mint && mint && body.mint !== mint) continue; // memo is about another token of the same creator
          return {
            mint: body.mint || mint || null,
            signer: payer, // fee payer; equals the creator wallet by construction (see the check above)
            socials: pickSocials(body),
            note: typeof body.note === 'string' ? body.note.slice(0, 280) : null,
            claims: await verifyClaims(body.claims, dev, rpcUrl),
            signature: s.signature,
            at: s.blockTime ? new Date(s.blockTime * 1000) : null,
          };
        } catch (e) {
          /* malformed memo, keep scanning */
        }
      }
    }
    return null;
  }

  async function build(mint, opts = {}) {
    const rpcUrl = opts.rpc || DEFAULT_RPC;
    mint = String(mint || '').trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) throw new Error('not a Solana mint address');
    const settled = await Promise.allSettled([onChain(mint, rpcUrl), jupiter(mint), rugcheck(mint), dexscreener(mint)]);
    const val = (i) => (settled[i].status === 'fulfilled' ? settled[i].value : null);
    const err = (i) => (settled[i].status === 'rejected' ? String(settled[i].reason.message || settled[i].reason) : null);
    const card = {
      mint,
      rpc: rpcUrl,
      chain: val(0),
      jup: val(1),
      rug: val(2),
      dex: val(3),
      errors: { chain: err(0), jup: err(1), rug: err(2), dex: err(3) },
      creator: null,
      creatorWallet: (val(1) && val(1).dev) || (val(0) && val(0).updateAuthority) || null,
      // where the creator wallet came from: Jupiter's dev field, else the Metaplex update authority
      creatorSource: val(1) && val(1).dev ? 'jupiter dev' : val(0) && val(0).updateAuthority ? 'update authority' : null,
      builtAt: new Date(),
    };
    if (card.creatorWallet && opts.creatorUpdate !== false) {
      try {
        card.creator = await creatorUpdate(card.creatorWallet, rpcUrl, opts.maxMemoTx, mint);
      } catch (e) {
        card.errors.creator = String(e.message || e);
      }
    }
    // Effective socials: creator-signed update wins, then immutable launch metadata.
    card.socials = Object.assign({}, (card.chain && card.chain.socials) || {}, (card.creator && card.creator.socials) || {});
    return card;
  }

  /* Global feed: every opendex memo whose transaction referenced the inbox, newest first.
     Each entry is self-reported until `creatorOk` is true (fee payer equals the token's known creator wallet). */
  async function feed(rpcUrl = DEFAULT_RPC, limit = 20, verify = true) {
    const sigs = await rpc(rpcUrl, 'getSignaturesForAddress', [INBOX, { limit }]);
    const out = [];
    for (const s of sigs) {
      if (s.err) continue;
      let tx;
      try {
        tx = await rpc(rpcUrl, 'getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 }]);
      } catch (e) {
        continue;
      }
      if (!tx) continue;
      const k0 = tx.transaction.message.accountKeys[0];
      const payer = k0 && (k0.pubkey || k0);
      for (const ix of tx.transaction.message.instructions || []) {
        if (ix.program !== 'spl-memo' && ix.programId !== MEMO_PROGRAM) continue;
        const memo = typeof ix.parsed === 'string' ? ix.parsed : null;
        if (!memo || !memo.startsWith(MEMO_PREFIX)) continue;
        let body;
        try { body = JSON.parse(memo.slice(MEMO_PREFIX.length)); } catch (e) { continue; }
        if (!body.mint || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.mint)) continue;
        const entry = { mint: body.mint, payer, socials: pickSocials(body), note: typeof body.note === 'string' ? body.note.slice(0, 280) : null, hasClaims: !!body.claims, signature: s.signature, at: s.blockTime ? new Date(s.blockTime * 1000) : null, creatorOk: null };
        if (verify) {
          try {
            const j = await jupiter(body.mint);
            let creator = j && j.dev;
            if (!creator) { const c = await onChainRaw(body.mint, rpcUrl); creator = c.updateAuthority; entry.name = c.name; entry.symbol = c.symbol; }
            if (j) { entry.name = j.raw.name; entry.symbol = j.raw.symbol; entry.image = j.raw.icon; }
            entry.creatorOk = !!creator && creator === payer;
          } catch (e) {
            entry.creatorOk = null;
          }
        }
        out.push(entry);
      }
    }
    return out;
  }

  const CLAIM_KEYS = ['lpBurn', 'lpLock', 'vesting', 'devWallets'];
  const memoFor = (socials, note, claims, mint) => {
    const body = {};
    if (mint) body.mint = mint;
    for (const k of SOCIAL_KEYS) if (socials[k]) body[k] = socials[k];
    if (note) body.note = String(note).slice(0, 280);
    if (claims) {
      const c = {};
      for (const k of CLAIM_KEYS) {
        const v = claims[k];
        if (Array.isArray(v) ? v.length : v) c[k] = v;
      }
      if (Object.keys(c).length) body.claims = c;
    }
    return MEMO_PREFIX + JSON.stringify(body);
  };

  root.OpenDex = { build, onChain, onChainRaw, metadataPda, jupiter, rugcheck, dexscreener, creatorUpdate, verifyClaims, feed, memoFor, DEFAULT_RPC, MEMO_PROGRAM, MEMO_PREFIX, INBOX, SOCIAL_KEYS, CLAIM_KEYS };
})(typeof window !== 'undefined' ? window : globalThis);
