const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Helper: fetch with timeout
async function fetchJson(url, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    // try parse JSON
    try { return { ok: true, status: res.status, data: JSON.parse(text) }; }
    catch(e){ return { ok: true, status: res.status, data: text }; }
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  } finally {
    clearTimeout(id);
  }
}

// BTC endpoint: primary CoinGecko, fallback Binance
app.get('/api/btc', async (req, res) => {
  try {
    const sources = [
      { url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', parser: d => d.bitcoin && d.bitcoin.usd ? Number(d.bitcoin.usd) : null },
      { url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', parser: d => d && d.price ? Number(d.price) : null }
    ];

    for (const s of sources) {
      const r = await fetchJson(s.url);
      if (r.ok && r.status >= 200 && r.status < 300) {
        const price = s.parser(r.data);
        if (price !== null && !Number.isNaN(price)) {
          return res.json({ price, source: s.url, fetched_at: new Date().toISOString() });
        }
      }
    }

    return res.status(502).json({ error: 'No price found from BTC sources' });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// XAU endpoint: primary metals.live, fallback exchangerate.host
app.get('/api/xau', async (req, res) => {
  try {
    const sources = [
      { url: 'https://api.metals.live/v1/spot', parser: data => {
          // metals.live returns array like [{symbol:'XAU', price:...}, ...]
          if (!Array.isArray(data)) return null;
          const item = data.find(i => i && (i.symbol === 'XAU' || (i.code && i.code === 'XAU')))
                    || data.find(i => i && i.symbol && typeof i.symbol === 'string' && i.symbol.toLowerCase().includes('xau'));
          return item && item.price ? Number(item.price) : null;
        }
      },
      { url: 'https://api.exchangerate.host/convert?from=XAU&to=USD', parser: d => (d && typeof d.result === 'number') ? Number(d.result) : null }
    ];

    for (const s of sources) {
      const r = await fetchJson(s.url);
      if (r.ok && r.status >= 200 && r.status < 300) {
        const price = s.parser(r.data);
        if (price !== null && !Number.isNaN(price)) {
          return res.json({ price, source: s.url, fetched_at: new Date().toISOString() });
        }
      }
    }

    return res.status(502).json({ error: 'No price found from XAU sources' });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

app.get('/', (req, res) => res.json({ status: 'proxy running' }));

app.listen(PORT, () => console.log(`Proxy server listening on port ${PORT}`));
