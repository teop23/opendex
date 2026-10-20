# Dexscreener "DEX paid" research (2026-10-20)

All claims below were checked live on 2026-10-20 against the APIs and pages cited. Scripts used are in this folder.

## 1. What "Enhanced Token Info" is

Source: https://marketplace.dexscreener.com/product/token-info, https://docs.dexscreener.com/llms-full.txt

- Product name: Enhanced Token Info (ETI). One of three paid products (ETI, Community Takeover, Boosts).
- Price shown: `$499.00` struck through, `$299.00` current. Pay "with crypto or credit card". Bags.fm resells it via API with a `payWithSol` flag; no official SOL price is published. The "3 SOL" figure is community shorthand.
- Community Takeover (CTO): `$199` (struck `$499`). Adds a claim to an existing profile.
- Boosts: separate, 12-24h visibility multiplier, 500 boosts = "Golden Ticker".
- What ETI delivers: logo, header banner, description, website/social links on the token page, team/roadmap text, self-reported circulating supply (changes displayed market cap), and a trending-score boost ("Tokens with verified info get a boost, especially those with Enhanced Token Info", docs/trending).
- Processing: "most orders processed within a few minutes, allow up to 12 hours". No verification/KYC on this product (KYC only on ad campaigns).
- Refund policy: no refund for inactive tokens or profile deletion. CTO not approved = no refund.
- Official free path per docs: "DEX Screener automatically looks for token information from external token lists, such as CoinGecko's. Once a token is present on such a list, all of its information will be displayed on DS automatically." CoinGecko listing is free but slow and gated.
- Moonshot (Dexscreener's own launchpad, now "Moonit") tokens got ETI free. Rick marks them "Moonshot token".

Revenue context (crypto.news, 2025-02-12): 0xngmi (DefiLlama) estimated $150k-$250k/day from ~$300 token info orders (Aug 2024). Conor Grogan (Coinbase) called the front page "nearly entire promoted bundled scams".

## 2. What "DEX paid" technically is

The flag every bot reads is one public endpoint:

```
GET https://api.dexscreener.com/orders/v1/solana/<mint>
{"orders":[{"type":"tokenProfile","status":"approved","paymentTimestamp":...}, ...],"boosts":[...]}
```

- `type`: `tokenProfile` (= ETI), `communityTakeover`, `tokenAd`, `trendingBarAd`.
- `status`: `approved`, `processing`, `on-hold`, `cancelled`.
- "DEX paid" = any `tokenProfile` order with status `approved`. Rick warns that `processing` can still fail and some tools mislabel it as paid.
- Paid profiles also appear in the firehose `GET /token-profiles/latest/v1` (icon, header, description, links, `cto` bool). Pair responses (`/latest/dex/search`, `/token-pairs/v1`) carry an `info` object (`imageUrl`, `websites`, `socials`) that is populated ONLY for paid/listed tokens (verified: 21 sampled pump.fun pairs, `info` present exactly on the 2 with `tokenProfile approved`, see `probe_socials.py`).

So the whole "trust" primitive is: did someone pay Dexscreener $299 for this mint. Nothing is verified about the payer.

## 3. Who consumes the flag

| Tool | Where it shows | Source |
|---|---|---|
| Rick bot (Telegram/Discord) | `/dp <ca>` command; DP status on pump.fun scans (DEV line); "📝" icon; socials in "More" row only when paid; DexPaid alerts (guaranteed on Premium, free on Discord) | docs.rick.bot/features/token-research, /dexpaid-alerts, /premium |
| Axiom | "Dex Paid" filter on Explore Tokens ("tokens that have paid for DEX listings"); 3rd-party guides describe a Dex Paid indicator on Pulse | docs.axiom.trade/axiom/finding-tokens/explore-tokens |
| GMGN | scraper on Apify sells "GMGN Dexscreener Paid Signals" so GMGN surfaces it as a signal | apify.com/muhammetakkurtt/gmgn-dexscreener-paid-signals-scraper |
| Standalone checkers | didid.lol/checkdexpaid, capitoday.com/dex-status (+ Telegram bot), Rick `/dp`. All wrap the orders endpoint. | |
| Bags.fm launchpad | API to buy ETI inside the launch flow (`create-dexscreener-order`, `payWithSol`) | docs.bags.fm |

Important: Rick's `/soc` (social finder) already falls back to Solana on-chain metadata when Dexscreener has nothing. Rick's docs: "shows socials from DexScreener or, on Solana, from on-chain metadata". So the data path exists in the most used bot; only the "DP" label is Dexscreener-gated.

## 4. What is on-chain already (IPFS works)

- Pump.fun tokens are Token-2022 with the metadata extension on the mint. `getAsset` returns `json_uri` = `https://ipfs.io/ipfs/<cid>`. `update_authority` is null, so the metadata is immutable after launch.
- The JSON is the pump.fun schema: `{name, symbol, description, image, showName, createdOn:"https://pump.fun", twitter, telegram, website}`. Other launchpads (rapidlaunch etc.) use the same keys.
- ipfs.io returns 403 to non-browser user agents; `https://pump.mypinata.cloud/ipfs/<cid>` serves pump.fun CIDs reliably; dweb.link and cloudflare-ipfs are degraded. Any client needs gateway fallback.
- Test: mint `6zRue4umcwQthw8TfChsBS4pGGCZ31Sj96ULMyx2pump` has twitter/telegram/website in its IPFS JSON. Dexscreener page shows NO socials, only an "Update Token Info" link to the $299 order page. Orders endpoint: empty. Conclusion: Dexscreener deliberately ignores on-chain socials for unpaid tokens even though it has the data (it shows the logo from the same JSON).
- Counter-test: mint `B9ije4bJj57ZrPvxbecYPVJTxb3S1Q5cahc5Z4YLpump` had a `tokenProfile processing` order placed 2 minutes earlier; the page already showed Website/Twitter. So socials appear only via the paid pipeline.

## 5. Dexscreener coverage of new tokens

User claim: "doesn't even show newly launched tokens". Partly outdated. Checked live: `new-pairs?chainIds=solana` lists pairs at 27s age; token pages exist for pump.fun bonding-curve tokens (DEX "Pump.fun", PROGRESS bar, 56%). What it does NOT show for them: socials (unless paid), and the `dexIds=pumpfun` filter on new-pairs returns "Nothing to see here" (filter bug or intentional). Bonding-curve tokens are not in the search API `info`.

## 6. Free trust signals that already exist (and who displays them)

| Signal | Cost | Shown in | Notes |
|---|---|---|---|
| On-chain socials in metadata URI | 0 | Axiom/GMGN/Photon/BullX feeds, Rick `/soc`, Solscan, wallets | Immutable on pump.fun (no update authority). Dexscreener ignores. |
| Jupiter Verified (VRFD) | Standard review free; Express 1,000 JUP | Jupiter, Phantom, Solflare, partner lists; `isVerified` in `lite-api.jup.ag/tokens/v2/search` | Holistic: organic score, holders, ticker uniqueness, social support via linked X. Community "Smart Likes" move queue. Removable. |
| Jupiter token API | 0 | API | Exposes `dev` wallet, `launchpad`, `audit.mintAuthorityDisabled/freezeAuthorityDisabled/topHoldersPercentage/devMigrations/devMints`, `organicScore`, `holderCount`. Fartcoin: organicScore 83, verified, dev had 496 mints. |
| Rugcheck API | 0 | rugcheck.xyz, Rick | `api.rugcheck.xyz/v1/tokens/<mint>/report/summary`: risks, score, `lpLockedPct`, copycat ticker detection. |
| Mint/freeze revoked, LP burned/locked | 0 | every terminal | Table stakes, not differentiating. |
| Dev token lock (Jupiter Lock, Streamflow) | ~0 (tx fee) | Jupiter token page, Rick | Real skin in the game, refundable to honest devs. |
| Solscan reputation/token update | 0 (form) | Solscan | Slow, manual. |
| CoinGecko listing | 0 | CoinGecko + Dexscreener auto-imports | Slow, requires traction. |

## 7. Why the community adopted "DEX paid" anyway

- Costly signal heuristic: "$300 means the dev has a budget / intends to stay". Axiom Q&A: "a paid token suggests the team has resources, while an unpaid one suggests the team is relatively short on funds".
- It is binary, instant, and queryable by one endpoint, so every bot added it. Rick added alerts; alerts create FOMO ("DEX paid" pump candles), which reinforces the loop.
- Mutable off-chain layer: pump.fun metadata is immutable; if a dev loses the X account or a CTO happens, Dexscreener's profile is the only widely-read place to change links. ETI/CTO sell that mutability for $199-$299.
- No capitoday/didid/Rick doc claims it is a safety signal. Capitoday FAQ: "Paying for Dex Screener is not a guarantee that a project is safe." Scams pay too (Grogan's claim).

## 8. Open items

- "rh trader" identified: peer Claude session running the user's paper-trading book. Its answers are in section 9.
- No public dataset of ETI-paid token outcomes exists. Build one (tracker script) to quantify how little "DEX paid" predicts survival.

## 9. Input from "rh trader" (peer trading session, 2026-10-20)

Paper book reads the on-chain tape (RPC getBlock, decoded pump/pumpswap events), not Dexscreener. Dexscreener is used for discovery and cross-checks only.

Dexscreener usage:
- `latest/dex/search`, `token-profiles/latest/v1`, `token-boosts/latest/v1`, `tokens/v1/solana/<mints>`, `token-pairs/v1/solana/<mint>`, `latest/dex/pairs/solana/<pair>`. No websockets, no orders endpoint.
- Batch `tokens/v1` returns 30 pools total across the batch, not per mint; go per mint via `token-pairs`.
- Pairs carry no LP-lock data; LP proof taken from recorded graduation on own tape.
- Real throttle was GeckoTerminal (10 req/min), not Dexscreener.

Paid / boosts / CTO as signal (pre-registered tests, holdout, n 10-15):
- Treated as SKIP flags, never a buy signal.
- Boosted Solana tokens returned -30% to -38% at 1 h.
- Claims / CTO showed no long edge.
- Tokens rated "REAL" by a checker were -63% at 24 h after the check.
- Read: paying marks the deployer, not quality.

Other free sources: own Solana tape, Jupiter price bars, Hyperliquid / Binance / Pacifica funding, fomo API, Axiom read-only in Chrome. Broken or limited: public Solana RPC (Cloudflare 403 after bursts), `getProgramAccounts` 413 on big dumps, Drift data API DNS dead. Not used: Helius, Birdeye, GMGN.

On the creator-signed memo channel:
- Self-reported links are useless as a positive signal. Creator self-promotion (paid, boosts, socials) predicts dumps, not pumps.
- Useful only if each claim points to a checkable on-chain fact: LP burn/lock tx signature, dev-wallet list, vesting account. A missing or false claim then becomes a skip. See PROPOSAL.md memo v1 claims.

Pre-migration pump.fun coverage:
- Dexscreener lists bonding-curve pairs but data is thin and delayed versus decoding pump events from blocks.
- The `pump` mint suffix is spoofed by pool farms; never treat the suffix as proof.
- Many pumpswap pools with deep liquidity are farms, not established coins.
- A pool with no trades after the horizon is effectively -100%; tracker must mark it so, not at last price.

## 10. Research round two (2026-10-20): what the $299 actually buys, verbatim

Dexscreener marketplace product page (marketplace.dexscreener.com/product/token-info):
- Price shown as "$499.00 $299.00". Pays in crypto or card.
- Listed benefits: logo and socials displayed; "credibility"; "community engagement"; "accurate market cap: setting wallets that hold locked supply".
- Process: form, pay, "Most orders are processed within just a few minutes, but please allow up to 12 hours." No review step described. No FAQ, no refund terms on the page.

Dexscreener docs (docs.dexscreener.com, llms-full.txt):
- Free route exists: "Once a token is present on such a list [CoinGecko], all of its information will be displayed on DS automatically." ETI is sold as speed: "as quickly as possible, regardless of listing status on external third party services."
- Trending score inputs include "Verified info (especially those with Enhanced Token Info)".
- Market cap for non-burning tokens uses "self-reported circulating supply from Enhanced Token Info or CoinGecko".
- Boosts: 12 to 24 h, 500+ active = Golden Ticker, non-refundable, removable if flagged, "merely one of many factors". No prices published; resellers quote $899/100 and $3,999/500.
- Direct advertising: fixed minimum budget $100,000, KYC required.
- Refund policy covers ETI, Token Advertising and CTO; CTO orders not approved are not refundable.
- Terms: user is "responsible for ensuring the legality, authenticity, and accuracy of all metadata"; company "does not adjudicate disputes regarding the ownership, authenticity, or legality"; may "restrict or remove visibility of content, data, related metadata at Our discretion."
- API terms (last updated 2023-08-18): license is revocable; cannot build or market "a product or service whose primary purpose is to compete directly with DEX Screener's product"; cannot make the API "available for third parties"; free and paid tiers; rate limits "detailed during the API Services checkout stage"; termination "at our sole discretion, at any time, with or without notice".
- API: 60 req/min on profiles, CTO, ads, metas endpoints. WebSocket at wss://api.dexscreener.com for profiles, CTO, ads, boosts. Profiles feed observed live: 30 items per call, 26 Solana / 4 BSC, 26 with header image, 14 with description.

Revenue (The Defiant, DeFiLlama data): over $1M per week in fees, up to $250k per day at peak, $5.4M in a 30-day window, Solana the largest chain (one day: $123k Solana vs $12k Ethereum). DeFiLlama's methodology: "All fees paid by users for token profile listing."

Moonshot (launchpad owned by Dexscreener): a Moonshot-launched token (UKFLMS, EuwTQ...moon) shows `tokenProfile: approved` with a paymentTimestamp plus four boost purchases in the orders API. Dexscreener's own launchpad tokens pay for the profile too.

Security flags: Dexscreener uses Blockaid (case study: detection under 10 minutes, rolled out on Solana and Base) plus user reports and manual review. Flagged tokens lose boosts. Not related to ETI.

Free paths confirmed:
- Solscan token update form (solscan.io/token-update) is free: logo, socials, website, description, reputation, CTO, migration. Requester email must be on the project domain. Priority support exists for a 24 h turnaround (price not listed).
- Jupiter Verify: Standard Review free, anyone can submit; Express 1,000 JUP burned for a 24-48 h review. Badge shows in Jupiter and Phantom. Criteria: market cap, organic score, holder distribution, ticker uniqueness, social support (X account dedicated to the project), on-chain liquidity.
- CoinGecko listing: token must trade on a tracked exchange; application through the dashboard; no fee stated by CoinGecko; third parties claim 1-7 business days.
- Helius free tier: 1M credits/month, 10 RPS, DAS 2 RPS at 10 credits each, no card required.

On-chain facts re-checked:
- pump.fun docs: "Name, symbol, and image are immutable. They're part of the SPL token metadata." Socials live in the same off-chain JSON and are immutable in practice because update authority is null.
- Metaplex JSON standard defines name, symbol, description, image, external_url, attributes, properties. twitter / telegram / website are a pump.fun convention, not part of the standard. Some launchpads use an `extensions` object; opendex reads both.
- SPL Memo: up to 566 bytes single-byte UTF-8 in an unsigned instruction; accounts passed must be signers; zero accounts is fine. Transaction size 1232 bytes (4096 planned via SIMD-0296, Q3 2026).
- getSignaturesForAddress returns transactions where the address appears in the account keys, signer or not. A 0-lamport System transfer to a fixed address is enough to make a transaction appear in that address's history. opendex uses this as a global feed. Inbox: sha256("opendex:inbox:v1:2") = FGzq3zKAY18ifGNsKmHdbPo262FSQtnGoDdy8HRQpYSj, off-curve (no private key), empty on mainnet at the time of writing.
- Solana Attestation Service (live May 2025) is the "proper" future home for creator attestations (issuer / schema / attestation accounts). opendex v1 uses memos because they cost nothing beyond the fee and need no program; SAS is a v2 candidate.

Consumers re-checked:
- Axiom: "Dex Paid" filter plus "At least one social" toggle and "Twitter Reuses" count. A filter guide calls Dex Paid "useless for new pairs" because sub-$20k tokens rarely have it.
- GMGN, Photon, BullX, Padre: no documented Dex Paid filter found.
- Dextools: no equivalent product found; "Community Trust" voting for paying users; "Social Boost" pilot.
- Birdeye: info updates via form, "Fast Track (2 days) or Regular Track (7 days)", reportedly $200-300 (third party, unverified).

Design references (for the opendex page redesign):
- arc.fun (pump.fun token, $46M): near-white page, Lora serif wordmark 700/48px, Fira Code mono body 14-16px, one green accent, one centred 3D render, nothing else.
- ore.com: #090810 background, Pilat / PilatWide display 700/48px, one centred 3D object, two buttons.
- web-4.app: full monospace terminal look, dotted grid, black, white, one accent; "Give your token a computer."
- hyperliquid.xyz: off-white top, serif display, mint-green particle field below.
- bags.fm, axiom.trade, pump.fun, gmgn.ai: dense dark terminals, system sans, green/red numbers. Not a reference for a document-style page.
- collectorcrypt.com, getgrass.io: illustrated marketing pages, card grids and 01/02/03 steps; the slop end of the spectrum.
- Pattern across the strong ones: one object, one accent, mono for data, no cards, no eyebrows.

## 11. Who else prints "DEX paid" (checked 2026-10-20, round three)

Checked in a browser, not from docs, where docs did not exist.

| Tool | What it shows | How verified |
|---|---|---|
| GMGN (gmgn.ai Trenches) | Every token card carries a "DS" badge with the age of the Dexscreener payment ("DS 1m", "DS 31m", "DS 12h", "DS 596d"). Reviews and a third-party scraper also list "Dex AD Paid / Dex Boost Paid / Dex Bar Paid" among its push signals. | Trenches page, logged out, 2026-10-20 |
| Photon (photon-sol.tinyastro.io) | "Dex Paid" row in the token audit block, next to Mint Authority, Freeze Authority, LP Burned. | Token page, logged out |
| Terminal, ex Padre (pump.fun's own terminal since the Nov 2025 acquisition) | Token cards carry a "Dex Paid (green Dexscreener icon): token creator updated enhanced token info on Dexscreener" and a "Dex Boosted (yellow Dexscreener icon)". Manual filter panel: "Toggle specific attributes (e.g., Dex paid, Has social, Dev still holding)". Card field list includes "Dex Boosted / Paid". | docs.padre.gg/app-guide/trenches (archived copy; live docs now redirect to the app, which requires sign-in). Rebrand: phemex.com, 2025-11-05 |
| Axiom | "Dex Paid" filter on Explore and Pulse. Blockworks data quoted by a competitor (June 2026) puts Axiom at roughly 45% of Solana spot volume; Terminal and Trojan in the top five. | docs.axiom.trade (section 3); moby.win citing Blockworks |
| Rick bot | /dp command, DP line on scans, DexPaid alerts. | docs.rick.bot (section 3) |
| Phanes bot (Telegram/Discord) | "Migration, CTO, DexPaid, X return and breaking-news alerts." | docs.phanes.bot |
| DexPaidAlerts (Telegram channel) | "Newest DEXScreener PAID Ads", 3,792 subscribers. | t.me/DexPaidAlerts |
| checkdexpaid (Telegram bot), Capitoday DexStatus, Whale Snipr (Chrome extension) | Standalone checkers wrapping the orders endpoint. | t.me/checkdexpaid, capitoday.com/dex-status, Chrome Web Store listing |
| Bags.fm | Sells ETI inside its launch flow via API. | docs.bags.fm (section 3) |

pump.fun coin page itself: no badge; "Dex paid" appears only in user comments ("Dex is paid!"). pump.fun routes power users to Terminal, which has the badge.

Not confirmed: BullX Neo (no public docs; one review says trading was suspended 2026-06-01), Nova, Bloom, Trojan (docs unreachable or no mention). Treat as unknown, not as absent.

Read: the flag is not a Rick/Axiom quirk. It is on the default card of GMGN, Photon and pump.fun's own Terminal, and a filter on Axiom and Terminal. A trader scanning Trenches sees "DS" before they see the dev wallet.

## Sources

- https://marketplace.dexscreener.com/product/token-info
- https://marketplace.dexscreener.com/product/token-community-takeover
- https://docs.dexscreener.com/llms-full.txt (token-listing, trending, boosting, refund policy)
- https://docs.dexscreener.com/api/reference
- https://docs.rick.bot/features/token-research, /features/pricebot, /features/dexpaid-alerts, /premium, /features/social-research
- https://docs.axiom.trade/axiom/finding-tokens/explore-tokens, /pulse
- https://axiompedia.com/guides/trading/axiom-pulse-glossary
- https://docs.jup.ag/user-docs/launch/vrfd/token-verification
- https://developers.jup.ag/docs/guides/how-to-get-token-information
- https://crypto.news/how-dex-screener-became-hub-for-crypto-scammers/
- https://capitoday.com/dex-status
- https://docs.bags.fm/api-reference/create-dexscreener-order
- https://docs.helius.dev/docs/orb/explore-authorities (pump.fun revokes update authority)
- https://kb.solscan.io/solscan-token-update-guideline

Round two sources:
- https://marketplace.dexscreener.com/product/token-info
- https://docs.dexscreener.com/llms-full.txt
- https://docs.dexscreener.com/api/api-terms-and-conditions.md
- https://docs.dexscreener.com/privacy/terms-and-conditions.md
- https://docs.dexscreener.com/boosting
- https://thedefiant.io/news/defi/dexscreener-is-earning-over-usd1-million-in-weekly-fees
- https://defillama.com/protocol/dex-screener
- https://decrypt.co/236904/dexscreeners-pump-fun-competitor-moonshot-solana-meme-coins
- https://blockaid.io/case-studies/dex-screener
- https://kb.solscan.io/solscan-token-update-guideline
- https://docs.jup.ag/user-docs/launch/vrfd/token-verification
- https://support.coingecko.com/hc/en-us/articles/7291312302617
- https://www.helius.dev/pricing
- https://pump.fun/docs/create-coin
- https://solana.com/docs/tokens/metaplex
- https://spl.solana.com/memo
- https://solana.com/docs/rpc/http/getsignaturesforaddress
- https://solana.com/news/solana-attestation-service
- https://memecoinnavigator.com/best-axiom-trade-filters-for-new-pairs/
- https://www.curvegrad.com/guides/what-is-a-dexscreener-boost
- https://capitoday.com/dex-status
