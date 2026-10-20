# Proposal: make "DEX paid" irrelevant without paying Dexscreener

Companion to `research/FINDINGS.md`. Three drafts; gaps found in each are kept so the reasoning is auditable.

## The actual problem (restated precisely)

"DEX paid" is not a data problem. The socials are already on-chain (IPFS JSON via the mint's metadata URI) and most terminals (Axiom, GMGN, Photon, BullX, Rick `/soc`) already read them. The problem is a **signalling** problem: the community uses "someone paid Dexscreener $299 for this mint" as a proxy for "dev has budget and intent", and bots turned that proxy into a binary field with alerts.

You cannot fake a costly signal for free. That is what makes it a costly signal. So the only moves are:

1. Make the free truth show up everywhere the paid flag shows up (remove the information gap).
2. Offer a **better** costly signal that costs honest devs ~0 and ruggers something real.
3. Discredit the old signal with data.

## Draft 1 (rejected)

"Build a free Dexscreener clone / open token-info registry that bots read instead."

Gaps:
- Bots will not switch sources for one project. Rick, Axiom, GMGN are closed and already have a source.
- A registry needs moderation for CTOs (who owns an abandoned token?), which is exactly why Dexscreener charges $199 for CTO. Free registry = spam registry.
- Hosting an indexer is not free at scale.

## Draft 2 (partially kept)

"Tell the community to use Rick `/soc` and Jupiter Verified instead of `/dp`."

Gaps:
- `/soc` shows links but gives no badge; the "DP" line on pump.fun scans still reads "not paid". The social pressure is the badge, not the links.
- Jupiter Verified Standard review has no timeline and needs organic traction first. Useless in the first 48 hours, which is when "DEX paid?" gets asked.
- Nothing changes on dexscreener.com itself, which is where the holder clicks the chart link and sees "Update Token Info" (an upsell that reads to holders as "dev did not pay").

## Draft 3 (final): opendex

Three free pieces, no server, no token, no fee.

### A. Trust card (static web page, client-side only)

`opendex.html` on GitHub Pages / any static host. Paste a mint, get a card built from free public APIs:

- On-chain metadata: name, symbol, image, twitter/telegram/website from the metadata URI (DAS `getAsset` on a public RPC, IPFS gateway fallback list). Shown as **"On-chain socials, immutable since launch"** with the CID.
- Jupiter token API: `isVerified`, `organicScore`, `holderCount`, `audit` (mint/freeze revoked, top-holder %, `devMints`, `devMigrations`), `dev` wallet, `launchpad`.
- Rugcheck summary: score, risks, LP locked %.
- Dexscreener orders: displayed honestly as **"Dexscreener receipt: none / $299 paid on <date>"**. The card frames it as a purchase, not a trust mark.
- Optional creator-signed override (see C) for projects whose links changed.

Shareable URL: `opendex.html#<mint>`. Pin it in the project Telegram next to the chart link. Zero install for holders.

### B. Dexscreener overlay (browser extension, MV3)

On `dexscreener.com/solana/<mint>` pages where the token has no paid profile, inject the on-chain socials and a "On-chain socials ✓ (free, immutable)" badge directly where Dexscreener shows "Update Token Info". Works on the user's own machine, no server. Also shows the Jupiter organic score and verified badge.

This is for the project's own core community and for traders who want the truth on the page they already use. It does not need Dexscreener's cooperation.

### C. Free update channel for links (closes the mutability gap)

Pump.fun metadata is immutable. Dexscreener sells mutability (ETI/CTO). Free alternative: the creator wallet (the `dev` wallet Jupiter and pump.fun expose) sends a Memo transaction to itself:

```
opendex:v1:{"twitter":"https://x.com/...","telegram":"https://t.me/...","website":"https://..."}
```

Optional `claims` object, added after input from the rh trader session (its data: self-reported links and paid promotion predict dumps, not pumps; only checkable facts carry information):

```
opendex:v1:{"twitter":"...","claims":{"lpBurn":"<tx sig>","lpLock":"<tx sig>","vesting":"<account>","devWallets":["<wallet>"]}}
```

Global feed: the publishing transaction also includes a 0-lamport transfer to the inbox address `FGzq3zKAY18ifGNsKmHdbPo262FSQtnGoDdy8HRQpYSj` (off-curve hash, no owner). `getSignaturesForAddress(inbox)` replaces Dexscreener's `token-profiles/latest` feed with no server. Memos carry `mint` so feed entries are attributable; readers mark an entry creator-signed only when the fee payer equals the token's creator wallet.

Readers verify each claim on-chain: `lpBurn` must be a confirmed transaction containing an SPL token burn, `lpLock` a confirmed transaction, `vesting` an existing account; `devWallets` are self-declared. A claim that fails verification is displayed as FAILED and is meant to be used as a skip flag. Links without claims are shown but labelled "not a signal".

Cost: one Solana tx fee (~0.000005 SOL). The card and the extension scan the creator wallet's recent memos and show the latest `opendex:v1` record as **"Creator-signed update, <date>, tx <sig>"**. This is cryptographically stronger than a Dexscreener profile (anyone with $299 can buy one; only the creator key can sign this). CTO stays out of scope: no free arbiter exists, and that is fine; CTO is 1% of cases.

### D. Outcome tracker (data to kill the heuristic)

`tracker/sample_paid.py` snapshots `token-profiles/latest/v1` (every new paid profile) daily with price/liquidity, and `tracker/followup.py` re-reads them after 1/3/7 days. Output: "% of DEX-paid tokens below 50% of paid-day price after 7 days". Run it from a cron or GitHub Actions (free). After two weeks there is a number to post every time someone asks "dex paid?".

### What this does NOT do (honest limits)

- It does not change Rick's "DP" line or Axiom's filter. Those read Dexscreener's receipt and will keep doing so until the heuristic dies.
- It does not give holders a badge in Phantom. Jupiter Verified does; apply for it (free) once there is organic volume, and the card tells people the application status.
- Adoption is the project's job: pin the card link, tell the group `/soc` exists, run the tracker and post the numbers.

### Gap pass on draft 3

| Gap | Mitigation |
|---|---|
| Public RPC rate limits on the card | Let the user paste an RPC URL (Helius free tier is 1M credits/mo); default to `api.mainnet-beta.solana.com`, which served `getAsset` in testing. |
| ipfs.io blocks non-browser UAs; browsers are fine, but extension/service-worker fetches may 403 | Gateway list in order: pinata (pump), ipfs.io, dweb.link, w3s.link. Try until JSON parses. |
| Memo spoofing: anyone can send a memo *to* the dev wallet | Only accept memos where the dev wallet is the fee payer / signer of the tx. Check `transaction.message.accountKeys[0] == dev`. |
| Dev wallet unknown for non-pump launches | Jupiter `dev` field covers pump.fun, bonk, bags, etc. Fallback: Metaplex update authority if present. Otherwise the override section just says "no creator wallet known". |
| Extension distribution (Chrome Web Store fee $5 one-time) | Ship as unpacked/zip on GitHub; Web Store optional. |
| "You're just moving trust to Jupiter" | Yes, deliberately: Jupiter Verified is free at the Standard tier, criteria are public, and the badge is shown in wallets. Also the card shows raw on-chain facts first, Jupiter second. |
| Card could be used by scammers too | It reports facts (dev mint count, top holders, LP lock). A scammer's card looks bad. That is the point. |

## Decision

Build A, B, C-reader (memo reading), D. C-writer (sending the memo) is a one-liner any dev can do with any wallet that supports memos; a tiny helper script is included.
