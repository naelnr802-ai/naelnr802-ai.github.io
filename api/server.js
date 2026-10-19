const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

// Simple in-memory cache
const cache = {
  BTC: null,
  XAU: null
};
function setCache(key, data, ttlSeconds = 15) {
  cache[key] = {
    data,
    expires: Date.now() + ttlSeconds * 1000
  };
}
function getCache(key) {
  const e = cache[key];
  if (!e) return null;
  if (Date.now() > e.expires) {
    cache[key] = null;
    return null;
  }
  return e.data;
}

// Helper: fetch with timeout
async function fetchWithTimeout(url, opts = {}, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, ...opts });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

// BTC via CoinGecko
async function fetchBTC() {
  const cached = getCache('BTC');
  if (cached) return cached;

  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true';
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error('CoinGecko fetch failed: ' + res.status);
  const json = await res.json();
  const result = {
    symbol: 'BTC',
    price_usd: Number(json.bitcoin?.usd ?? null),
    updated_at: json.bitcoin?.last_updated_at ? new Date(json.bitcoin.last_updated_at * 1000).toISOString() : null,
    source: 'coingecko'
  };
  // cache short (10s)
  setCache('BTC', result, 10);
  return result;
}

// Robust XAU fetch with multiple fallbacks
async function fetchXAU() {
  const cached = getCache('XAU');
  if (cached) return cached;

  const sources = [
    {
      name: 'exchangerate_host',
      url: 'https://api.exchangerate.host/convert?from=XAU&to=USD',
      parser: async (res) => {
        const j = await res.json();
        return { price: (typeof j?.result === 'number') ? Number(j.result) : null, updated_at: j?.date ?? null };
      }
    },
    {
      name: 'goldprice_org',
      url: 'https://data-asg.goldprice.org/dbXRates/USD',
      parser: async (res) => {
        const j = await res.json();
        const item = Array.isArray(j?.items) ? j.items[0] : null;
        const price = item?.xauPrice ?? item?.xauPriceFloat ?? item?.price ?? null;
        return { price: price ? Number(price) : null, updated_at: item?.updated ?? null };
      }
    },
    {
      name: 'metals_live',
      url: 'https://api.metals.live/v1/spot',
      parser: async (res) => {
        const j = await res.json();
        if (!Array.isArray(j)) return { price: null, updated_at: null };
        const item = j.find(i => i && ((i.symbol && String(i.symbol).toUpperCase().includes('XAU')) || (i.code && i.code === 'XAU')));
        const price = item?.price ?? null;
        return { price: price ? Number(price) : null, updated_at: null };
      }
    },
    {
      name: 'coingecko_gold',
      url: 'https://api.coingecko.com/api/v3/simple/price?ids=tether-gold,pax-gold&vs_currencies=usd',
      parser: async (res) => {
        const j = await res.json();
        const candidate = j?.['tether-gold']?.usd ?? j?.['pax-gold']?.usd ?? null;
        return { price: candidate ? Number(candidate) : null, updated_at: null };
      }
    }
  ];

  let lastError = null;
  for (const s of sources) {
    try {
      const res = await fetchWithTimeout(s.url, {}, 7000);
      if (!res.ok) { lastError = `Source ${s.name} returned ${res.status}`; console.warn(lastError); continue; }
      const parsed = await s.parser(res);
      if (parsed && parsed.price && !Number.isNaN(parsed.price)) {
        const result = { symbol: 'XAU', price_usd: Number(parsed.price), updated_at: parsed.updated_at ?? null, source: s.name };
        // cache XAU a bit longer (15s)
        setCache('XAU', result, 15);
        return result;
      }
      lastError = `Source ${s.name} returned no price`;
      console.warn(lastError);
    } catch (e) {
      lastError = `Source ${s.name} failed: ${e.message || e}`;
      console.warn(lastError);
      continue;
    }
  }

  throw new Error('No XAU price available. Last error: ' + (lastError || 'unknown'));
}

app.get('/api/price', async (req, res) => {
  const symbol = (req.query.symbol || 'BTC').toUpperCase();
  try {
    if (symbol === 'BTC') {
      const data = await fetchBTC();
      return res.json(data);
    } else if (symbol === 'XAU' || symbol === 'GOLD') {
      const data = await fetchXAU();
      return res.json(data);
    } else {
      return res.status(400).json({ error: 'Unsupported symbol. Use BTC or XAU' });
    }
  } catch (err) {
    console.error('/api/price error', err && err.message ? err.message : err);
    return res.status(502).json({ error: err.message || String(err) });
  }
});

app.get('/_health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});
