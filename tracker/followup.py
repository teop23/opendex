"""Re-read every snapshotted paid token and report survival after 1, 3 and 7 days.

Run daily. Writes tracker/data/followups.jsonl and prints a summary table:
  share of DEX-paid tokens whose price is below 50% / 10% of the price at the moment the profile went live,
  and share whose liquidity is below $1k ("dead").
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
SNAP = os.path.join(DATA, "paid_snapshots.jsonl")
FOLLOW = os.path.join(DATA, "followups.jsonl")
WINDOWS = {"d1": 1, "d3": 3, "d7": 7}


def get(url, timeout=20):
    req = urllib.request.Request(url, headers={"user-agent": "opendex-tracker/0.1", "accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def load(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def main():
    snaps = load(SNAP)
    done = {(f["tokenAddress"], f["window"]) for f in load(FOLLOW)}
    now = datetime.now(timezone.utc)
    new = 0
    with open(FOLLOW, "a", encoding="utf-8") as out:
        for s in snaps:
            t0 = datetime.fromisoformat(s["sampledAt"])
            for w, days in WINDOWS.items():
                if (s["tokenAddress"], w) in done or now < t0 + timedelta(days=days):
                    continue
                try:
                    pairs = get(f"https://api.dexscreener.com/token-pairs/v1/{s['chainId']}/{s['tokenAddress']}")
                except Exception as e:  # noqa: BLE001
                    pairs = []
                best = max(pairs, key=lambda x: (x.get("liquidity") or {}).get("usd") or 0) if pairs else None
                price = float(best.get("priceUsd") or 0) if best else 0.0
                liq = ((best.get("liquidity") or {}).get("usd") or 0) if best else 0
                # A pool with no trades in the last 24h is dead; its last print is not a price. Record it as -100%.
                h24 = ((best or {}).get("txns") or {}).get("h24") or {}
                dead = best is None or ((h24.get("buys") or 0) + (h24.get("sells") or 0)) == 0
                if dead:
                    price = 0.0
                rec = {
                    "checkedAt": now.isoformat(),
                    "tokenAddress": s["tokenAddress"],
                    "chainId": s["chainId"],
                    "window": w,
                    "price0": s["priceUsd"],
                    "price": price,
                    "ratio": (price / s["priceUsd"]) if s["priceUsd"] else None,
                    "liquidityUsd": liq,
                    "dead": dead,
                }
                out.write(json.dumps(rec) + "\n")
                done.add((s["tokenAddress"], w))
                new += 1
                time.sleep(0.25)
    rows = load(FOLLOW)
    print(f"{now.isoformat()} new followups: {new}; total: {len(rows)}\n")
    print(f"{'window':8}{'n':>6}{'<50% price':>13}{'<10% price':>13}{'liq<$1k':>10}")
    for w in WINDOWS:
        rs = [r for r in rows if r["window"] == w and r["ratio"] is not None]
        if not rs:
            continue
        n = len(rs)
        pct = lambda f: f"{100 * sum(1 for r in rs if f(r)) / n:5.1f}%"  # noqa: E731
        print(f"{w:8}{n:>6}{pct(lambda r: r['ratio'] < 0.5):>13}{pct(lambda r: r['ratio'] < 0.1):>13}{pct(lambda r: r['liquidityUsd'] < 1000):>10}")


if __name__ == "__main__":
    sys.exit(main())
