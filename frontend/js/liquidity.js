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
    } catch (err) {
      setStatus(statusEl, 'error', `⚠️ ${err.message}`);
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
