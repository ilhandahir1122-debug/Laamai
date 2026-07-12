/* ===== ADD LIQUIDITY =====
   Creating a real Raydium/OpenBook liquidity pool involves market-id creation,
   base/quote vault setup and multi-step SDK calls with real SOL cost (~2-3 SOL
   for the OpenBook market alone). That flow is NOT wired to real funds yet —
   this page collects the pool parameters and calls a backend stub so the UI
   and API contract are ready; /api/liquidity/create-pool currently returns
   501 Not Implemented. Wire up the Raydium SDK in
   backend/services/raydium.service.js when you're ready to go live. */

(function initLiquidity() {
  const form = document.getElementById('liquidityForm');
  if (!form) return;

  const statusEl = document.getElementById('liquidityStatus');
  const submitBtn = document.getElementById('liquiditySubmitBtn');
  const feeNote = document.getElementById('feeNote');

  if (feeNote) {
    fetch(LAAM_BACKEND_URL + '/api/payment/fee-info')
      .then((r) => r.json())
      .then((info) => {
        if (info.liquidityFeeSol > 0) {
          feeNote.textContent = `Includes a ${info.liquidityFeeSol} SOL platform fee, plus normal Solana network fees, once this feature goes live.`;
        }
      })
      .catch(() => {});
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const owner = LaamWallet.getPublicKey();
    if (!owner) {
      setStatus(statusEl, 'error', 'Connect your Phantom wallet first.');
      return;
    }

    const mint = document.getElementById('liqMintAddr').value.trim();
    const solAmount = document.getElementById('liqSolAmount').value.trim();
    const tokenAmount = document.getElementById('liqTokenAmount').value.trim();

    if (!mint || !solAmount || !tokenAmount) {
      setStatus(statusEl, 'error', 'Fill in the mint address and both amounts.');
      return;
    }

    submitBtn.disabled = true;
    try {
      const res = await fetch(LAAM_BACKEND_URL + '/api/liquidity/create-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, mint, solAmount, tokenAmount }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Liquidity pool creation is not available yet.');
      setStatus(statusEl, 'success', 'Pool creation transaction sent.');
    } catch (err) {
      setStatus(statusEl, 'error', `⚠️ ${err.message}`);
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
