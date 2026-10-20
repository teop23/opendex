# larpcheck.app as a reference (checked 2026-10-20)

Why it matters: same audience (trenches, X, Telegram), same product shape (paste a CA, get a card), shipped three weeks ago and already at 13.4K bot posts and 5,186 followers on X. Everything below is how they do distribution; opendex has none of it yet.

## OG / link previews

Every page has its own server-rendered meta. The HTML comment they leaked on `/agent` says it outright: a Worker (`spaWithMeta` in `src/index.ts`) injects title, description, `og:*` and `twitter:*` per route before the SPA boots, and a script (`web/scripts/meta-check.ts`) tests the tags. Pages that have no special data fall back to the site-wide set.

| Page | Title | Image |
| --- | --- | --- |
| `/` | larpcheck: is it real, or is it LARP? | `/og.png?v=4`, 1200x630, static brand card (logo, headline, one-line pitch, the seven verdict chips as a legend) |
| `/c/{id}/{verdict-slug}` | `PARTLY REAL: namepad.fun, vanity-address pump.fun launchpad · larpcheck` | `/shots/{id}/og.jpg`, 1200x630, rendered per check |
| everything else (`/how`, `/pro`, `/coins`, `/dev/...`) | site default | site default |

Per-check card layout (1200x630, dark, two fonts: grotesk for verdict and sentence, mono for labels and numbers):

- Top left logo, top right the subject (domain, or `$TICKER MC $74.7K · 11 min old` with the token image).
- Verdict word huge in its colour with a coloured bar at the left, score `52/100` on the right, a five-segment gradient bar with a marker under it.
- Site check: one mono category line, then the one-sentence summary at display size, plus a screenshot of the site on the right.
- Coin check: two columns, NARRATIVE and COIN, each with word + score + bar, plus a TOTAL, then the summary sentence.
- Footer: the canonical URL `larpcheck.app/c/{id}` and the time on the left, a fixed disclaimer on the right ("Checks the claim, not the team: real projects can still rug.").
- On coin cards a yellow pill at the top advertises their own token.

The verdict is in the `og:title` as the first word, so a link preview reads as a verdict even where the image does not load (Telegram text-only previews, X text replies). `twitter:card` is `summary_large_image` everywhere.

The URL carries the verdict slug (`/partly-real`) but the id alone (`/c/{id}`) also resolves; the slug is for the preview and the share text.

## Share flow

A Share button on every check: Copy link, Post on X, Send on Telegram. Three items, nothing else. The X intent presumably carries the verdict title plus the URL, so the card does the rest.

Next to it: "Open full report (1 credit)", "Run again", "Go deeper (PRO)", "Are you the team? Respond to this check". The report page has tabs Report / Log (the agent's command log, 15 steps) / Ask (PRO).

## X bot (@Larpcheckbot)

- Mention it under any post, with or without a CA. Reply arrives in minutes. 13.4K posts in roughly three weeks, 5,186 followers, 2 following. Bio names a backup account (@larpcheckbot2) for when the main one is rate-limited, and the human behind it (@0xgalt).
- Every reply is "Automated by @0xgalt" plus a fixed template:

```text
$HOLD · TOTAL 54/100 · NARRATIVE: PARTLY REAL 55 · COIN: NEUTRAL 52
Burn mechanism real but tiny; clean dev, 19 holders, too young to call.

Narrative stamp: the story. Coin stamp: holders, dev, liquidity. No rug guarantee. DYOR.
```

  followed by the link, which unfurls into the per-check OG card. When no CA was given:

```text
NARRATIVE: PARTLY REAL 42 · COIN: NOT CHECKED
A real but simulated web game with play-money USDC on devnet...

Narrative only, NOT a coin check. Before you buy, tag me with the CA: I'll check the story and the coin.
```

- Replies carry the two-column OG card, so the verdict is readable in the timeline without a click. The disclaimer line is in every reply. The CTA when no CA was given ("tag me with the CA") turns every reply into a prompt for the next one.

## Telegram bot (@larpcheckbot)

- Bot profile description: "$LARPCHECK on SOL is funding free usage. Investigates if a project is real or not. https://larpcheck.app". Message it a CA, a post or a link; it replies with the verdict and the report link. Verdict replies are free; the full report costs a credit on the site.
- Not tested from this machine (would need to message it from an account).

## Discord

`/check` slash command after adding the app (OAuth install link on the site).

## Site

- Routes: `/` feed, `/coins`, `/deployers` (dev wallet pages at `/dev/{wallet}` with "N real / M checked"), `/community`, `/agent`, `/how`, `/pro`, `/me`, `/privacy`, `/terms`. All return 200. Socials in the footer: X, Telegram, Discord, all resolve.
- The feed is the product's own marketing: live checks with a timer, Latest / Calls / Most checked / Most real / Least real / 5m volume tabs, a "Most checked 24h" sidebar and "Devs whose coins checked out".
- Credits: 5 free checks a day per visitor, every verdict free to read, Pro for holding their token. "Connect wallet" in the nav is for the Pro gate.
- Their own token's CA is pinned in a bar above the nav on every page and on every coin OG card.
- Cloudflare in front (CSP nonce, Turnstile). Direct curl of `/` returns a 403 challenge page; the routes under it do not. The SPA renders into closed shadow roots, so `innerText` and link extraction from outside return almost nothing; meta tags are the only thing a scraper sees, which is the point.
- Ten UI languages; verdict words stay English in all of them.

## Gaps on opendex, in order of payoff

1. **No OG tags at all.** `web/index.html` and `web/manifesto.html` have neither `og:*` nor `twitter:*`. A share of `opendex.info/#<mint>` unfurls as nothing. Minimum: a static 1200x630 brand card and tags on both pages. Better: per-mint cards.
2. **Hash routing kills per-mint previews.** Crawlers do not see `#<mint>`. Per-mint OG needs a real path (`/t/<mint>`) served with meta injected at the edge: a Pages Function or Worker that fetches the same free sources the page uses, writes title + description + `og:image`, and returns the SPA shell. Image rendering needs a Worker with an SVG-to-PNG step (resvg-wasm or Satori) or a prebuilt template with text overlaid; either way one route, cached per mint for a few minutes.
3. **Card content that fits the opendex claim.** Title as `CREATOR SIGNED: $TICKER · opendex` / `NO SIGNED LINKS: $TICKER · opendex` / `CLAIM FAILED: $TICKER`, then the audit row (mint, freeze, LP, creator) and the receipt line ("Dexscreener paid 2024-10-18" or "not paid") as facts, never as a verdict. Footer: `opendex.info/t/<mint>` and the standing line "Who signed, not who paid."
4. **Share button**: Copy link, Post on X, Send on Telegram. Same three.
5. **Bots.** An X bot that answers `@opendex <CA>` with the card, and a Telegram bot that answers a pasted CA, both replying with the same per-mint link so the OG card carries the content. Feed watcher as the third: post every new `opendex:v1` memo from the inbox with its verified claims. larpcheck's reply template is the model: one fact line, one sentence, one fixed disclaimer, one CTA.
6. **A visible human.** Their bot says "Automated by @0xgalt" on every reply; the bio names a backup handle. opendex has no X account at all.

What not to copy: the token pinned above the nav, the credits and Pro gate, the agent theatre. opendex's whole pitch is that nothing is gated and nobody is in the middle.
