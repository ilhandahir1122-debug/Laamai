# LAAM AI — Token Launcher

```
frontend/   static site — deploy to GitHub Pages (or any static host)
backend/    Node/Express API — deploy to Render
```

## How it works

The backend never touches your private key. For every on-chain action
(create token, revoke authority) it **builds an unsigned transaction**
with your wallet address as fee payer, sends it to the browser, and your
Phantom wallet signs it locally before it's broadcast to Solana. The
backend's job is only: build transactions, and optionally upload
token logo/metadata to IPFS.

## Local setup

```bash
cd backend
npm install
cp .env.example .env      # fill in SOLANA_RPC_URL / Pinata keys as needed
npm run dev                # http://localhost:4000
```

Open `frontend/index.html` directly in a browser (or serve the folder
with any static server) — `frontend/js/wallet.js` defaults
`LAAM_BACKEND_URL` to `http://localhost:4000`.

## Deploy backend to Render

1. Push this repo to GitHub.
2. On Render: **New → Web Service**, connect the repo.
3. **Root Directory:** `backend`
4. **Build Command:** `npm install`
5. **Start Command:** `npm start`
6. Add the environment variables from `backend/.env.example` in Render's dashboard
   (at minimum set `ALLOWED_ORIGIN` to your GitHub Pages URL, and `SOLANA_RPC_URL`
   to a real RPC provider — the public endpoint is too rate-limited for production).

## Deploy frontend to GitHub Pages

1. In the repo's GitHub Pages settings, serve from the `frontend/` folder (or move
   its contents to the repo root / a `docs/` folder, whichever your Pages setup expects).
2. Before deploying, set your live backend URL in `frontend/js/wallet.js`:
   ```js
   const LAAM_BACKEND_URL = window.LAAM_BACKEND_URL || 'https://your-backend.onrender.com';
   ```

## What's real vs. stubbed

- **Create Token** ([frontend/create-token.html](frontend/create-token.html)) — fully implemented: mints a real SPL token on mainnet-beta with Metaplex metadata.
- **Revoke Authority** ([frontend/revoke.html](frontend/revoke.html)) — fully implemented: revokes mint/freeze authority on a token you control.
- **Dashboard** ([frontend/dashboard.html](frontend/dashboard.html)) — fully implemented: lists SPL tokens in the connected wallet via live RPC calls.
- **Add Liquidity** ([frontend/liquidity.html](frontend/liquidity.html)) — fully implemented: creates a real Raydium CPMM pool (token + SOL) via `@raydium-io/raydium-sdk-v2` (`backend/services/raydium.service.js`). No OpenBook market needed, so it costs a few hundredths of a SOL rather than several. Also auto-resolves the token's name/symbol from its mint address (`GET /api/token/info/:mint`). Note the SDK package is still tagged `alpha` upstream — test with a small amount first.
- **Lock Liquidity** (same page, below Add Liquidity) — fully implemented: permanently locks 100% of the connected wallet's LP tokens for a pool via Raydium's lock program, minting a receipt NFT. Irreversible by design ("no rug" proof).

## What's not built (and why)

A pump.fun-style **bonding curve** (buy/sell before any real liquidity pool exists, automatic "graduation" into a pool once a threshold is hit, per-trade creator fee) needs its own custom on-chain Solana program — that's a different category of work from everything else here (which only calls existing, audited programs: SPL Token, Metaplex, Raydium). Writing and deploying a program that escrows real user funds carries real risk if it has bugs, and normally goes through a paid security audit before touching mainnet. Out of scope here; DexScreener/Jupiter pick up any real Raydium pool automatically once it exists, no extra integration needed.

## Metadata (logo) upload

`POST /api/metadata/upload` uploads the logo + JSON metadata to IPFS via
Pinata. If `PINATA_API_KEY`/`PINATA_API_SECRET` aren't set in `.env`, this
returns a 503 and the Create Token form falls back to letting the user
paste an existing metadata URI manually.

## Costs to be aware of

Every token created on mainnet-beta costs real SOL (mint account rent +
metadata account rent + tx fee, roughly 0.02 SOL total). The current
`SOLANA_RPC_URL` default (`api.mainnet-beta.solana.com`) is a shared
public endpoint — fine for testing, but get a free Helius/QuickNode key
before sending this live to real users.
