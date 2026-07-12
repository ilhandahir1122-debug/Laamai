const LAAM_MINT = "8JdUWBFHVCjWgAKuSqVG5DwrGhpR3rwu4Z39HSJJAKMT";

/* Point this at your deployed Render backend, e.g. "https://laam-ai-backend.onrender.com" */
const LAAM_BACKEND_URL = window.LAAM_BACKEND_URL || 'https://laamai-1.onrender.com';

function fmtUsd(n, decimals){
  if (n === null || n === undefined) return '—';
  return decimals !== undefined ? `$${n.toFixed(decimals)}` : `$${(n/1000).toFixed(1)}K`;
}

/* ===== LIVE STATS — proxied through our backend (avoids browser CORS/rate-limit
   blocks that public RPC/Birdeye endpoints impose on direct dApp calls) ===== */
async function loadStats(){
  try{
    const res = await fetch(`${LAAM_BACKEND_URL}/api/market/stats`);
    if(!res.ok) throw new Error(`Backend returned ${res.status}`);
    const s = await res.json();

    const price   = s.priceUsd !== null ? `$${s.priceUsd.toFixed(8)}` : '—';
    const mcap    = fmtUsd(s.marketCapUsd);
    const liq     = fmtUsd(s.liquidityUsd);
    const vol     = fmtUsd(s.volume24hUsd);
    const holders = s.holders !== null ? s.holders.toLocaleString() : '—';

    document.getElementById('sPrice').textContent   = price;
    document.getElementById('sMcap').textContent    = mcap;
    document.getElementById('sLiq').textContent     = liq;
    document.getElementById('sHolders').textContent = holders;
    document.getElementById('sVol').textContent     = vol;
    document.getElementById('hPrice').textContent   = price;
    document.getElementById('hLiq').textContent     = liq;
    document.getElementById('hHolders').textContent = holders;

    if(s.priceChange24h !== null){
      const el = document.getElementById('sChange');
      const ch = s.priceChange24h;
      el.textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%';
      el.style.color = ch >= 0 ? '#4ade80' : '#f87171';
    }
  }catch(e){
    document.querySelectorAll('.loading').forEach(el=>{
      el.textContent = 'unavailable'; el.style.fontSize = '.68rem'; el.style.color = 'var(--dim)';
    });
  }
}
if (document.getElementById('sPrice')) loadStats();

/* ===== WALLET TRACKER — REAL DATA via our backend (server-side RPC call,
   avoids the CORS/rate-limit blocks public Solana RPCs impose on browsers) ===== */
const walletBtn = document.getElementById('walletBtn');
const walletIn  = document.getElementById('walletIn');
const walletOut = document.getElementById('walletOut');

if (walletBtn) walletBtn.addEventListener('click', async () => {
  const addr = walletIn.value.trim();
  if(!addr){ walletIn.focus(); return; }

  // Basic Solana address validation (base58, 32-44 chars)
  if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)){
    walletOut.innerHTML = '<div class="placeholder-msg">⚠️ Invalid Solana address. Paste a full base58 wallet address.</div>';
    return;
  }

  walletOut.innerHTML = '<div class="scan-line"></div><div class="placeholder-msg">Scanning Solana blockchain…</div>';

  try{
    const res = await fetch(`${LAAM_BACKEND_URL}/api/wallet/${addr}`);
    const snap = await res.json();
    if(!res.ok) throw new Error(snap.error || `Request failed (${res.status})`);

    const solBalance = snap.solBalance.toFixed(4);
    const laamBalance = snap.laamBalance.toFixed(2);
    const laamNum = snap.laamBalance;

    const tierLabel =
      laamNum >= 50 ? '<span class="up">⭐ Tier 4 — Full Premium + API</span>'
    : laamNum >= 25 ? '<span class="up">🐋 Tier 3 — Whale Tracker</span>'
    : laamNum >= 10 ? '<span style="color:var(--teal)">📊 Tier 2 — Market Analysis</span>'
    : laamNum >= 5  ? '<span style="color:var(--teal)">🤖 Tier 1 — AI Chat</span>'
    : '<span class="neutral">No tier — buy LAAM to unlock</span>';

    const shortAddr = addr.slice(0,5)+'…'+addr.slice(-4);
    const solscanLink = `https://solscan.io/account/${addr}`;

    walletOut.innerHTML = `
      <div class="drow"><span>Address</span><b><a href="${solscanLink}" target="_blank" style="color:var(--teal)">${shortAddr} ↗</a></b></div>
      <div class="drow"><span>SOL Balance</span><b>${solBalance} SOL</b></div>
      <div class="drow"><span>LAAM AI Balance</span><b>${laamBalance} LAAM</b></div>
      <div class="drow"><span>Total Transactions</span><b>${snap.txCount}</b></div>
      <div class="drow"><span>Access Tier</span><b>${tierLabel}</b></div>
      <div class="drow"><span>Whale Status</span><b>${laamNum>=50 ? '<span class="up">⚡ Large holder</span>' : laamNum>0 ? '<span style="color:var(--teal)">Regular holder</span>' : '<span class="neutral">No LAAM held</span>'}</b></div>
    `;
  } catch(err){
    walletOut.innerHTML = `<div class="placeholder-msg">❌ ${err.message}<br><br>Check address and try again, or view on <a href="https://solscan.io/account/${addr}" target="_blank" style="color:var(--teal)">Solscan ↗</a></div>`;
  }
});
if (walletIn) walletIn.addEventListener('keydown', e => { if(e.key==='Enter') walletBtn.click(); });

/* ===== MARKET ANALYSIS — same backend-proxied stats used above ===== */
const marketBtn = document.getElementById('marketBtn');
const marketOut = document.getElementById('marketOut');

if (marketBtn) marketBtn.addEventListener('click', async () => {
  marketOut.innerHTML = '<div class="scan-line"></div><div class="placeholder-msg">Pulling live market data…</div>';
  try{
    const res = await fetch(`${LAAM_BACKEND_URL}/api/market/stats`);
    const s = await res.json();
    if(!res.ok) throw new Error(s.error || `Request failed (${res.status})`);

    const price   = s.priceUsd !== null ? `$${s.priceUsd.toFixed(8)}` : '—';
    const mcap    = fmtUsd(s.marketCapUsd);
    const liq     = fmtUsd(s.liquidityUsd);
    const vol24   = fmtUsd(s.volume24hUsd);
    const holders = s.holders !== null ? s.holders.toLocaleString() : '—';
    const ch24    = s.priceChange24h;

    const isUp = ch24 !== null ? ch24 >= 0 : true;
    const sentiment = ch24 === null ? 'Neutral' : isUp ? 'Bullish 🟢' : 'Cautious 🔴';

    let bars = '';
    for(let i=0;i<14;i++) bars += `<i style="height:${Math.max(12,Math.floor(Math.random()*88)+10)}%"></i>`;

    marketOut.innerHTML = `
      <div class="drow"><span>Token</span><b>LAAM AI (Solana)</b></div>
      <div class="drow"><span>USD Price</span><b>${price}</b></div>
      <div class="drow"><span>24h Change</span><b class="${ch24===null?'neutral':isUp?'up':'down'}">${ch24!==null?(isUp?'+':'')+ch24.toFixed(2)+'%':'—'}</b></div>
      <div class="market-bars">${bars}</div>
      <div class="drow"><span>24h Volume</span><b>${vol24}</b></div>
      <div class="drow"><span>Liquidity</span><b>${liq}</b></div>
      <div class="drow"><span>Market Cap</span><b>${mcap}</b></div>
      <div class="drow"><span>Holders</span><b>${holders}</b></div>
      <div class="drow"><span>AI Sentiment</span><b class="${isUp?'up':'down'}">${sentiment}</b></div>
    `;
  } catch(err){
    marketOut.innerHTML = `<div class="placeholder-msg">Could not fetch market data: ${err.message}</div>`;
  }
});

/* ===== AI CHAT WIDGET ===== */
(function(){
  const toggle = document.getElementById('aiToggle');
  const panel  = document.getElementById('aiPanel');
  const body   = document.getElementById('aiBody');
  const input  = document.getElementById('aiIn');
  const send   = document.getElementById('aiSend');
  if (!toggle || !panel || !body || !input || !send) return;

  toggle.addEventListener('click', () => panel.classList.toggle('open'));

  const KB = {
    mint:     `The LAAM AI mint address on Solana is:\n8JdUWBFHVCjWgAKuSqVG5DwrGhpR3rwu4Z39HSJJAKMT\nAlways verify this before swapping.`,
    buy:      `To buy LAAM AI:\n1. Open a Solana wallet (Phantom, Solflare)\n2. Fund it with SOL\n3. Go to Birdeye: birdeye.so/solana/token/8JdUWBFHVCjWgAKuSqVG5DwrGhpR3rwu4Z39HSJJAKMT\n4. Connect wallet and swap`,
    tiers:    `Access tiers by LAAM balance:\n• 5 LAAM → AI Chat Assistant\n• 10 LAAM → Market Analysis + News\n• 25 LAAM → Wallet Tracker + Whale Alerts\n• 50+ LAAM → Trading Signals + Full API`,
    tools:    `LAAM AI powers: AI Crypto Assistant, Market Analysis, Wallet Tracking, Whale Alerts, Scam Detection, Trading Signals, Portfolio Management, News Summarization, NFT Analytics, DeFi Insights, and API Access.`,
    network:  `LAAM AI runs on Solana — the fastest Layer 1 blockchain with sub-second transactions and minimal fees. Tracked and traded on Birdeye — Solana's leading analytics and trading platform.`,
    birdeye: `Track LAAM AI live on Birdeye — real-time price, charts, whale trades, and holder analytics at: birdeye.so/solana/token/8JdUWBFHVCjWgAKuSqVG5DwrGhpR3rwu4Z39HSJJAKMT`,
    default:  `I can help with the mint address, how to buy LAAM, what tools are available, or the access tiers. What would you like to know?`
  };

  function matchKB(t){
    t = t.toLowerCase();
    if(t.includes('mint')||t.includes('address')||t.includes('contract')) return KB.mint;
    if(t.includes('buy')||t.includes('purchase')||t.includes('swap')||t.includes('get')) return KB.buy;
    if(t.includes('tier')||t.includes('unlock')||t.includes('access')||t.includes('hold')) return KB.tiers;
    if(t.includes('tool')||t.includes('feature')||t.includes('what')) return KB.tools;
    if(t.includes('birdeye')||t.includes('chart')||t.includes('track')) return KB.birdeye;
    if(t.includes('solana')||t.includes('network')||t.includes('chain')||t.includes('jupiter')) return KB.network;
    return KB.default;
  }

  function addMsg(text, cls){
    const d = document.createElement('div');
    d.className = 'amsg '+cls;
    d.innerText = text;
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
  }

  function respond(text){
    addMsg(text,'user');
    const t = document.createElement('div');
    t.className = 'typing';
    t.innerHTML = '<span></span><span></span><span></span>';
    body.appendChild(t); body.scrollTop = body.scrollHeight;
    setTimeout(()=>{ t.remove(); addMsg(matchKB(text),'bot'); }, 600+Math.random()*400);
  }

  send.addEventListener('click', ()=>{ const v=input.value.trim(); if(!v)return; respond(v); input.value=''; });
  input.addEventListener('keydown', e=>{ if(e.key==='Enter') send.click(); });
  document.querySelectorAll('.chip').forEach(c=>c.addEventListener('click',()=>respond(c.innerText)));
})();

/* ===== COPY MINT ===== */
function copyMint(){
  navigator.clipboard.writeText(document.getElementById('mintAddr').innerText);
  const b = document.querySelector('.copy-btn'); const old = b.innerText;
  b.innerText='Copied!'; setTimeout(()=>{b.innerText=old;}, 1400);
}

// Hamburger menu
const hamBtn = document.getElementById('hamBtn');
const mobMenu = document.getElementById('mobMenu');
function closeMob(){ mobMenu.classList.remove('open'); }
if(hamBtn){ hamBtn.addEventListener('click', ()=> mobMenu.classList.toggle('open')); }
document.addEventListener('click', e=>{
  if(mobMenu && hamBtn && !mobMenu.contains(e.target) && !hamBtn.contains(e.target)) closeMob();
});

/* ===== DASHBOARD (dashboard.html) — lists SPL tokens held by the connected wallet ===== */
(function initDashboard(){
  const listEl = document.getElementById('dashboardTokens');
  if(!listEl) return;

  const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

  async function loadTokens(owner){
    listEl.innerHTML = '<div class="empty-state">Loading your tokens…</div>';
    try{
      const result = await rpc('getTokenAccountsByOwner', [
        owner,
        { programId: TOKEN_PROGRAM_ID },
        { encoding: 'jsonParsed' }
      ]);

      const accounts = (result.value || [])
        .map(v => v.account.data.parsed.info)
        .filter(info => parseFloat(info.tokenAmount.uiAmountString || '0') > 0);

      if(!accounts.length){
        listEl.innerHTML = '<div class="empty-state">No SPL tokens found in this wallet yet. <a href="create-token.html" style="color:var(--teal)">Create one →</a></div>';
        return;
      }

      listEl.innerHTML = accounts.map(info => {
        const mint = info.mint;
        const short = mint.slice(0,5)+'…'+mint.slice(-4);
        return `
          <div class="token-row">
            <div>
              <div class="tmint">${short}</div>
              <div class="tbal">${info.tokenAmount.uiAmountString} tokens · ${info.tokenAmount.decimals} decimals</div>
            </div>
            <a href="https://solscan.io/token/${mint}" target="_blank">View on Solscan ↗</a>
          </div>
        `;
      }).join('');
    }catch(err){
      listEl.innerHTML = `<div class="empty-state">❌ Could not load tokens: ${err.message}</div>`;
    }
  }

  document.addEventListener('laam-wallet-changed', () => {
    const pk = LaamWallet.getPublicKey();
    if(pk) loadTokens(pk);
    else listEl.innerHTML = '<div class="empty-state">Connect your wallet to see your tokens.</div>';
  });
})();
