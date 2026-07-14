/* ===== ADD LIQUIDITY =====
   Creates a real Meteora DAMM v2 pool pairing your token with SOL. Meteora
   charges no protocol fee for pool creation (unlike some other DEXs) — you
   only pay Solana rent, plus our platform fee. The liquidity position is
   permanently locked the moment the pool is created (isLockLiquidity), so
   there's no separate "lock" step and no way for anyone to ever pull it out.
   Same non-custodial pattern as everywhere else: the backend builds an
   unsigned transaction (feePayer = your wallet), your wallet signs it
   locally, and the backend relays the already-signed transaction to Solana
   (public RPCs reject direct browser/mobile submissions with 403s). */

(function initLiquidity() {
  const form = document.getElementById('liquidityForm');
  if (!form) return;

  const statusEl = document.getElementById('liquidityStatus');
  const resultEl = document.getElementById('liquidityResult');
  const submitBtn = document.getElementById('liquiditySubmitBtn');
  const feeNote = document.getElementById('feeNote');
  const ratioEl = document.getElementById('poolRatio');
  const tokenAmountEl = document.getElementById('liqTokenAmount');
  const solAmountEl = document.getElementById('liqSolAmount');
  const mintEl = document.getElementById('liqMintAddr');
  const mintHint = document.getElementById('mintLookupHint');
  const tokenANameEl = document.getElementById('tokenAName');
  const pairTitleEl = document.getElementById('poolPairTitle');

  let resolvedSymbol = null;
  let lookupTimer = null;

  function resetTokenLookup() {
    resolvedSymbol = null;
    tokenANameEl.textContent = 'Your Token';
    pairTitleEl.textContent = '';
  }

  async function lookupToken(mint) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
      resetTokenLookup();
      return;
    }
    mintHint.textContent = 'Looking up token…';
    try {
      const info = await fetch(LAAM_BACKEND_URL + '/api/token/info/' + mint).then((r) => r.json());
      if (info.error) throw new Error(info.error);
      const label = info.name && info.symbol ? `${info.name} (${info.symbol})` : info.symbol || info.name || 'Unnamed token';
      resolvedSymbol = info.symbol || info.name || 'TOKEN';
      tokenANameEl.textContent = label;
      pairTitleEl.textContent = `${resolvedSymbol} / SOL`;
      mintHint.textContent = `Decimals: ${info.decimals}`;
    } catch (err) {
      resetTokenLookup();
      mintHint.textContent = 'Could not find a token at this address — double-check the mint.';
    }
  }

  mintEl.addEventListener('input', () => {
    clearTimeout(lookupTimer);
    const mint = mintEl.value.trim();
    if (!mint) {
      resetTokenLookup();
      mintHint.textContent = "Paste your token's mint address — its name is looked up automatically on-chain.";
      return;
    }
    lookupTimer = setTimeout(() => lookupToken(mint), 500);
  });

  if (feeNote) {
    fetch(LAAM_BACKEND_URL + '/api/payment/fee-info')
      .then((r) => r.json())
      .then((info) => {
        if (info.liquidityFeeSol > 0) {
          feeNote.textContent = `Includes a ${info.liquidityFeeSol} SOL platform fee, plus Solana rent + network fees. Meteora itself charges no pool creation fee.`;
        }
      })
      .catch(() => {});
  }

  function updateRatio() {
    const t = parseFloat(tokenAmountEl.value);
    const s = parseFloat(solAmountEl.value);
    if (t > 0 && s > 0) {
      ratioEl.innerHTML = `Starting price: <b>1 SOL = ${(t / s).toLocaleString(undefined, { maximumFractionDigits: 4 })} tokens</b> &nbsp;·&nbsp; <b>1 token = ${(s / t).toFixed(10)} SOL</b>`;
    } else {
      ratioEl.textContent = '';
    }
  }
  tokenAmountEl.addEventListener('input', updateRatio);
  solAmountEl.addEventListener('input', updateRatio);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    resultEl.style.display = 'none';
    const owner = LaamWallet.getPublicKey();
    if (!owner) {
      setStatus(statusEl, 'error', 'Connect your wallet first.');
      return;
    }

    const mint = document.getElementById('liqMintAddr').value.trim();
    const tokenAmount = tokenAmountEl.value.trim();
    const solAmount = solAmountEl.value.trim();

    if (!mint || !tokenAmount || !solAmount) {
      setStatus(statusEl, 'error', 'Fill in the mint address and both amounts.');
      return;
    }

    submitBtn.disabled = true;
    try {
      setStatus(statusEl, 'info', 'Building pool creation transaction…');
      const { transaction, poolId, estimatedCostSol } = await postJSON('/api/liquidity/create-pool', {
        owner,
        mint,
        tokenAmount,
        solAmount,
      });

      const breakdown = `
        <div class="pool-ratio" style="text-align:left;">
          <div class="result-row"><span>Your SOL deposit</span><span>${solAmount} SOL</span></div>
          <div class="result-row"><span>Meteora pool creation fee</span><span>0 SOL (free)</span></div>
          <div class="result-row"><span>Rent + network + platform fee</span><span>~${(estimatedCostSol - Number(solAmount)).toFixed(5)} SOL</span></div>
        </div>
      `;
      const proceed = await confirmCost(statusEl, estimatedCostSol, breakdown);
      if (!proceed) {
        setStatus(statusEl, 'info', 'Cancelled — no transaction was sent.');
        return;
      }

      setStatus(statusEl, 'info', 'Confirm the transaction in your wallet…');
      const sig = await signAndSend(transaction);

      setStatus(statusEl, 'success', 'Pool created and liquidity locked permanently! It may take a minute to appear on DexScreener/Jupiter.');
      resultEl.style.display = 'block';
      resultEl.innerHTML = `
        <div class="result-row"><span>Pool ID</span><span>${poolId}</span></div>
        <div class="result-row"><span>Transaction</span><span><a href="${explorerTxUrl(sig)}" target="_blank">${sig.slice(0, 12)}… ↗</a></span></div>
        <div class="result-row"><span>View on DexScreener</span><span><a href="https://dexscreener.com/solana/${encodeURIComponent(poolId)}" target="_blank">Open ↗</a></span></div>
      `;
    } catch (err) {
      setStatus(statusEl, 'error', `⚠️ ${err.message}`);
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
