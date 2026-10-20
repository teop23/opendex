"""Snapshot every new Dexscreener paid token profile with its price/liquidity at the moment it appears.

Run on a schedule (every 10-30 minutes). Appends to tracker/data/paid_snapshots.jsonl, de-duplicated by (chainId, tokenAddress).
No API key needed. Dexscreener rate limit for these endpoints: 60/min for profiles, 300/min for pairs.
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
SNAP = os.path.join(DATA, "paid_snapshots.jsonl")
CHAINS = {c for c in os.environ.get("OPENDEX_CHAINS", "solana").split(",") if c}


def get(url, timeout=20):
    req = urllib.request.Request(url, headers={"user-agent": "opendex-tracker/0.1", "accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def seen_keys():
    if not os.path.exists(SNAP):
        return set()
    with open(SNAP, encoding="utf-8") as f:
        return {(json.loads(line)["chainId"], json.loads(line)["tokenAddress"]) for line in f if line.strip()}


def main():
    os.makedirs(DATA, exist_ok=True)
    seen = seen_keys()
    profiles = get("https://api.dexscreener.com/token-profiles/latest/v1")
    now = datetime.now(timezone.utc).isoformat()
    added = 0
    with open(SNAP, "a", encoding="utf-8") as out:
        for p in profiles:
            key = (p["chainId"], p["tokenAddress"])
            if p["chainId"] not in CHAINS or key in seen:
                continue
            pairs = get(f"https://api.dexscreener.com/token-pairs/v1/{p['chainId']}/{p['tokenAddress']}")
            best = max(pairs, key=lambda x: (x.get("liquidity") or {}).get("usd") or 0) if pairs else None
            rec = {
                "sampledAt": now,
                "chainId": p["chainId"],
                "tokenAddress": p["tokenAddress"],
                "url": p.get("url"),
                "cto": p.get("cto"),
                "links": [l.get("type") or l.get("label") for l in (p.get("links") or [])],
                "pairAddress": best and best.get("pairAddress"),
                "dexId": best and best.get("dexId"),
                "pairCreatedAt": best and best.get("pairCreatedAt"),
                "priceUsd": best and float(best.get("priceUsd") or 0),
                "liquidityUsd": best and ((best.get("liquidity") or {}).get("usd") or 0),
                "fdv": best and best.get("fdv"),
                "marketCap": best and best.get("marketCap"),
            }
            out.write(json.dumps(rec) + "\n")
            seen.add(key)
            added += 1
            time.sleep(0.25)
    print(f"{now} added {added} new paid profiles (total {len(seen)})")


if __name__ == "__main__":
    sys.exit(main())
