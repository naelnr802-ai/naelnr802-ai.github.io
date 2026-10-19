# Price dashboard (BTC & XAU)

This repository contains a small Express API and a static UI to display BTC and XAU (gold) prices.

What I added:
- api/server.js — Express server exposing `/api/price?symbol=BTC|XAU`.
- public/index.html — Minimal dashboard that consumes the API.
- package.json — dependencies and start scripts.

Quick start (local):

1. Install dependencies

   npm install

2. Run the server

   npm start

The UI is available at http://localhost:3000 and the API endpoints are under `/api`.

Notes:
- BTC is fetched from CoinGecko (no API key required).
- Gold (XAU) is fetched from a public feed (data-asg.goldprice.org). For production use you should replace that with a paid API (Metals-API, GoldAPI, etc.) and store your API key in an environment variable.
- This repo is named as a GitHub Pages site (username.github.io). If you want to publish only the static UI to GitHub Pages, you can deploy the contents of `public/` to the `gh-pages` branch or use a workflow to build and push static files. The Express API cannot run on GitHub Pages — host it on a platform like Render, Heroku, Vercel (serverless) or Railway.

What's next (suggestions):
- Add a small healthcheck and logging to the API.
- Add caching to avoid rate limits on external APIs.
- Add CI workflow to run tests and deploy the static UI.

