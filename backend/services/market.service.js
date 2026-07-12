const LAAM_MINT = '8JdUWBFHVCjWgAKuSqVG5DwrGhpR3rwu4Z39HSJJAKMT';
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || '';

async function fetchWithTimeout(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(tid);
  }
}

/** Real market data for the LAAM AI token — DexScreener needs no API key and is
 *  the primary source; Birdeye (holder count) is used only if BIRDEYE_API_KEY is set. */
async function getMarketStats() {
  const dxRes = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${LAAM_MINT}`);
  if (!dxRes.ok) throw new Error(`DexScreener request failed (${dxRes.status})`);
  const dx = await dxRes.json();
  const pair = dx.pairs?.[0];
  if (!pair) throw new Error('No trading pair found for this token yet.');

  const stats = {
    priceUsd: pair.priceUsd ? parseFloat(pair.priceUsd) : null,
    marketCapUsd: pair.marketCap ?? pair.fdv ?? null,
    liquidityUsd: pair.liquidity?.usd ?? null,
    volume24hUsd: pair.volume?.h24 ?? null,
    priceChange24h: pair.priceChange?.h24 ?? null,
    holders: null,
    source: 'dexscreener',
  };

  if (BIRDEYE_API_KEY) {
    try {
      const bRes = await fetchWithTimeout(
        `https://public-api.birdeye.so/defi/token_overview?address=${LAAM_MINT}`,
        { headers: { 'X-API-KEY': BIRDEYE_API_KEY, 'x-chain': 'solana' } }
      );
      if (bRes.ok) {
        const b = await bRes.json();
        if (b?.data?.holder) stats.holders = b.data.holder;
      }
    } catch (e) {
      // Birdeye is a best-effort enrichment only — DexScreener data above already stands.
    }
  }

  return stats;
}

module.exports = { getMarketStats, LAAM_MINT };
