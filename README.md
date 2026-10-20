# opendex

**Who signed, not who paid.** A free, serverless replacement for the "DEX paid" badge on Solana.

Live page: **https://opendex-6bd.pages.dev/** (paste a mint, or open `/#<mint>`).
The argument: [OPENDEX.md](OPENDEX.md). The research behind it: [research/FINDINGS.md](research/FINDINGS.md).

## The problem in one paragraph

Dexscreener sells "Enhanced Token Info" for $299. It is a form, a payment and a queue: no review, no check on the project, and the terms say Dexscreener "does not adjudicate" what is submitted. When the payment lands, one field in one public endpoint flips to `tokenProfile: approved`. That field is what GMGN, Photon, pump.fun's Terminal, Axiom, Rick, Phanes and every "checker" print as "DEX paid", usually in the same row as mint authority and LP burn, as if it were an audit result. Meanwhile the X, Telegram and website links the $299 unlocks were written to the token's own IPFS metadata at launch. Dexscreener reads that file to show the logo and hides the links from it until the money arrives.

## What opendex does

- **Read.** Builds a trust card for any mint from free sources: on-chain metadata, the IPFS JSON behind it, Jupiter's token API (dev wallet, holders, organic score, mint/freeze audit, verified flag), Rugcheck's summary, and Dexscreener's own orders endpoint so the receipt is shown for what it is ("someone paid $299 on this date").
- **Write.** Lets the creator wallet publish a link update as one SPL Memo transaction. Only the key that launched the token can sign it, so it cannot be bought. Cost: one gas fee, about 0.000005 SOL.
- **Feed.** Every update also sends 0 lamports to a fixed inbox address that nobody controls. One `getSignaturesForAddress` call lists every opendex update ever published. No feed server.
- **Verify.** Memos can carry claims (LP burn tx, LP lock tx, vesting account, dev wallets). Readers check them on the chain. A claim that fails is shown as FAILED, which is a better skip flag than any receipt.

Everything runs in the visitor's browser against public endpoints. No backend, no API key, nothing to moderate.

## What is in here

| Path | What |
| --- | --- |
| `web/index.html` | The page. One static file. Paste a mint, get the card. Share links are `#<mint>`. Hosts the creator "publish a link update" form and the inbox feed. |
| `web/opendex-core.js` | The library. `OpenDex.build(mint)`, `OpenDex.feed()`, `OpenDex.verifyClaims()`, `OpenDex.memoFor()`. Vanilla JS, no dependencies, parses Token-2022 and Metaplex metadata itself. |
| `extension/` | Chrome MV3 content script. On any `dexscreener.com/solana/...` page it mounts a strip with the on-chain socials, Jupiter and Rugcheck facts and the receipt line. Works on unpaid tokens where Dexscreener hides the links. `extension/opendex-core.js` is a copy of the web one. |
| `tracker/` | Two stdlib-only Python scripts. `sample_paid.py` snapshots every new paid profile with price and liquidity at the moment it goes live; `followup.py` re-checks at 1 / 3 / 7 days. Purpose: produce the number that shows "DEX paid" predicts nothing. |
| `research/` | `FINDINGS.md`: everything checked live, with sources and dates. `domains.md`: domain availability. `test_core.mjs`: smoke test for the core against a real mint. |
| `article/` | Diagrams for the manifesto (`article/src/` are the HTML sources, rendered with headless Chrome at 1600 px). |
| `PROPOSAL.md` | Design notes, alternatives considered, why memos and not a program. |

## Run it

Page:

```bash
python -m http.server 8787 --directory web
```

Then open `http://localhost:8787/#<mint>`. Any static host works; there is no build step. The live page is Cloudflare Pages:

```bash
npx wrangler pages deploy web --project-name opendex --branch main
```

Extension: `chrome://extensions`, Developer mode, Load unpacked, pick `extension/`. Open a Dexscreener Solana token page. The options page takes an optional RPC URL.

Core smoke test:

```bash
node research/test_core.mjs 9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump
```

Trackers:

```bash
python tracker/sample_paid.py
```

```bash
python tracker/followup.py
```

Run `sample_paid.py` every 10 to 30 minutes and `followup.py` daily. `OPENDEX_CHAINS=solana,base` widens the chain filter. Data lands in `tracker/data/*.jsonl`.

## The memo format (v1)

pump.fun metadata is immutable, so a creator whose X or Telegram changed has no on-chain way to say so. opendex defines one. Any reader can implement it without this code.

1. Send a transaction whose fee payer is the creator wallet: the token deployer as reported by Jupiter's `dev` field, or the Metaplex update authority for legacy mints.
2. Include one SPL Memo instruction (program `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`). Memo text: `opendex:v1:` followed by a JSON object with `mint` and any of `twitter`, `telegram`, `website`, `discord`, `github`, `note` (280 chars max) and an optional `claims` object. Whole memo under 566 bytes.
3. Include a System transfer of 0 lamports to the inbox `FGzq3zKAY18ifGNsKmHdbPo262FSQtnGoDdy8HRQpYSj`. It is `sha256("opendex:inbox:v1:2")` interpreted as a public key, off the ed25519 curve, so no private key exists for it. `getSignaturesForAddress(inbox)` is the global feed.
4. `claims` is the part that carries information: `lpBurn` (tx signature; must contain an SPL token burn), `lpLock` (tx signature; must be confirmed), `vesting` (account; must exist), `devWallets` (array; self-declared). Links are self-reported and must be labelled as such by readers.
5. Readers scan the creator wallet's recent transactions and take the newest memo whose fee payer is the creator. Memos from any other wallet are ignored.

Example memo text:

```text
opendex:v1:{"mint":"9BB6...pump","twitter":"https://x.com/...","telegram":"https://t.me/...","claims":{"lpBurn":"3dQe...k1Lp"}}
```

## Sources used (all free, all public)

- Solana RPC: `https://solana-rpc.publicnode.com` by default. Calls go from the visitor's browser, so the rate limit applies per visitor IP. As of 2026-10-20 it is the only free endpoint that answers browser requests without a key; the helper retries on HTTP 429. Any RPC with `getAsset` is used automatically when configured.
- IPFS gateways, in order: pump.mypinata.cloud, ipfs.io, w3s.link, dweb.link, gateway.pinata.cloud.
- Jupiter: `https://lite-api.jup.ag/tokens/v2/search?query=<mint>`
- Rugcheck: `https://api.rugcheck.xyz/v1/tokens/<mint>/report/summary`
- Dexscreener: `/orders/v1/solana/<mint>`, `/token-pairs/v1/solana/<mint>`, `/latest/dex/pairs/solana/<id>`. Optional; used only to resolve a pair to a mint and to show the receipt line.

## Limits

- Not a safety rating. A token with real links, burned LP and a verified creator can still go to zero.
- Public RPC is rate-limited per visitor. The memo scan reads up to 25 (page) / 15 (extension) recent transactions of the creator wallet. Heavy use wants a free Helius key in the RPC field.
- Untested on mainnet: wallet signing, positive memo detection and claim verification against a real memo. No `opendex:v1` memo exists yet. Memo building, the fee-payer check and the scan itself run without errors.
- Jupiter's `dev` field is the creator source for pump.fun tokens. If Jupiter has not indexed the token, the update authority is used, which is null for pump.fun mints, so no creator channel is shown.
- Memos are v1. Solana Attestation Service is the likely v2 home; the `opendex:v1:` prefix lets readers migrate.

## Verified on

- Unpaid pump.fun token `6zRue4umcwQthw8TfChsBS4pGGCZ31Sj96ULMyx2pump`: socials shown by opendex, hidden by Dexscreener.
- Paid token `9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump` (Fartcoin): same links as Dexscreener shows after payment, plus the purchase date.
- Extension strip injected on a live Dexscreener page: all four sources resolved, no errors.

## Contributing

Readers in other languages, launchpad integrations that write the memo at create time, and bots that alert on the inbox are the most useful contributions. Keep the core dependency-free. If you change `web/opendex-core.js`, copy it to `extension/opendex-core.js`. Research claims need a source and a date in `research/FINDINGS.md`.

## License

MIT. See [LICENSE](LICENSE).
