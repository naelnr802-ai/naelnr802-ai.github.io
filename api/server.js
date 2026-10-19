const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public'));

// Helper: fetch BTC price from CoinGecko
async function fetchBTC() {
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true';
  const res = await fetch(url);
  if (!res.ok) throw new Error('CoinGecko fetch failed');
  const json = await res.json();
  return {
    symbol: 'BTC',
    price_usd: json.bitcoin.usd,
    updated_at: json.bitcoin.last_updated_at ? new Date(json.bitcoin.last_updated_at * 1000).toISOString() : null
  };
}

// Helper: fetch Gold (XAU) price from a public gold price endpoint
// Note: This endpoint is a simple public feed; for production use consider a paid API with SLAs.
async function fetchXAU() {
  const url = 'https://data-asg.goldprice.org/dbXRates/USD';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Gold price fetch failed');
  const json = await res.json();
  // The feed returns an object with items[0].xauPrice (per troy ounce USD)
  const item = Array.isArray(json.items) && json.items[0] ? json.items[0] : null;
  const price = item && (item.xauPrice || item.goldprice) ? (item.xauPrice || item.goldprice) : null;
  return {
    symbol: 'XAU',
    price_usd: price,
    updated_at: item && item.updated ? item.updated : null
  };
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
    console.error(err);
    return res.status(502).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});
