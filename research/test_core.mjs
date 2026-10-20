import fs from 'node:fs';
const src = fs.readFileSync(new URL('../web/opendex-core.js', import.meta.url), 'utf8');
new Function(src)();
const DF = globalThis.OpenDex;
for (const m of process.argv.slice(2)) {
  const t0=Date.now();
  const c = await DF.build(m);
  console.log(m, (Date.now()-t0)+'ms');
  console.log(JSON.stringify({name:c.chain?.name, immutable:c.chain?.immutable, cid:c.chain?.cid, socials:c.socials, chainErr:c.chain?.error,
    jup:c.jup&&{verified:c.jup.verified,org:c.jup.organicScore,dev:c.jup.dev,lp:c.jup.launchpad,audit:c.jup.audit},
    rug:c.rug, dex:c.dex&&{paid:c.dex.paid,paidAt:c.dex.paidAt,boosts:c.dex.boosts,shown:!!c.dex.shownSocials,dexId:c.dex.dexId},
    creator:c.creator, errors:c.errors},null,1));
}
