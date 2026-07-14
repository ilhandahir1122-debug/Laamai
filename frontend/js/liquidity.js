/* ===== ADD LIQUIDITY =====
   Creates a real Raydium CPMM pool pairing your token with SOL.
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
          feeNote.textContent = `Includes a ${info.liquidityFeeSol} SOL platform fee, plus normal Solana network fees.`;
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
      const { transaction, poolId } = await postJSON('/api/liquidity/create-pool', {
        owner,
        mint,
        tokenAmount,
        solAmount,
      });

      setStatus(statusEl, 'info', 'Confirm the transaction in your wallet…');
      const sig = await signAndSend(transaction);

      setStatus(statusEl, 'success', 'Pool created! It may take a minute to appear on Raydium/Jupiter.');
      resultEl.style.display = 'block';
      resultEl.innerHTML = `
        <div class="result-row"><span>Pool ID</span><span>${poolId}</span></div>
        <div class="result-row"><span>Transaction</span><span><a href="${explorerTxUrl(sig)}" target="_blank">${sig.slice(0, 12)}… ↗</a></span></div>
        <div class="result-row"><span>View on Raydium</span><span><a href="https://raydium.io/liquidity-pools/?token=${encodeURIComponent(mint)}" target="_blank">Open ↗</a></span></div>
      `;

      const lockPoolIdEl = document.getElementById('lockPoolId');
      if (lockPoolIdEl) lockPoolIdEl.value = poolId;
    } catch (err) {
      setStatus(statusEl, 'error', `⚠️ ${err.message}`);
    } finally {
      submitBtn.disabled = false;
    }
  });
})();

/* ===== LOCK LIQUIDITY ===== */
(function initLockLiquidity() {
  const form = document.getElementById('lockLiquidityForm');
  if (!form) return;

  const statusEl = document.getElementById('lockStatus');
  const resultEl = document.getElementById('lockResult');
  const submitBtn = document.getElementById('lockSubmitBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    resultEl.style.display = 'none';
    const owner = LaamWallet.getPublicKey();
    if (!owner) {
      setStatus(statusEl, 'error', 'Connect your wallet first.');
      return;
    }

    const poolId = document.getElementById('lockPoolId').value.trim();
    if (!poolId) {
      setStatus(statusEl, 'error', 'Enter the pool ID.');
      return;
    }
    if (!confirm('This permanently locks 100% of your LP tokens for this pool. This cannot be undone. Continue?')) {
      return;
    }

    submitBtn.disabled = true;
    try {
      setStatus(statusEl, 'info', 'Building lock transaction…');
      const { transaction, nftMint } = await postJSON('/api/liquidity/lock-pool', { owner, poolId });

      setStatus(statusEl, 'info', 'Confirm the transaction in your wallet…');
      const sig = await signAndSend(transaction);

      setStatus(statusEl, 'success', 'Liquidity locked permanently.');
      resultEl.style.display = 'block';
      resultEl.innerHTML = `
        <div class="result-row"><span>Lock Receipt (NFT)</span><span>${nftMint}</span></div>
        <div class="result-row"><span>Transaction</span><span><a href="${explorerTxUrl(sig)}" target="_blank">${sig.slice(0, 12)}… ↗</a></span></div>
      `;
    } catch (err) {
      setStatus(statusEl, 'error', `⚠️ ${err.message}`);
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
