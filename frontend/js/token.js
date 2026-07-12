/* ===== TOKEN CREATE + REVOKE AUTHORITY =====
   Powers create-token.html and revoke.html.
   Flow: backend BUILDS an unsigned transaction (feePayer = your wallet),
   Phantom SIGNS it in your browser, this script SENDS it to Solana.
   Your private key never leaves Phantom and never touches the backend.
   Shared helpers (setStatus, signAndSend, postJSON, explorer links) live in wallet.js. */

/* ---------- CREATE TOKEN ---------- */
(function initCreateToken() {
  const form = document.getElementById('createTokenForm');
  if (!form) return;

  const statusEl = document.getElementById('createStatus');
  const resultEl = document.getElementById('createResult');
  const submitBtn = document.getElementById('createSubmitBtn');
  const imageInput = document.getElementById('tokenImage');
  const preview = document.getElementById('imagePreview');
  const feeNote = document.getElementById('feeNote');

  if (feeNote) {
    fetch(LAAM_BACKEND_URL + '/api/payment/fee-info')
      .then((r) => r.json())
      .then((info) => {
        if (info.createTokenFeeSol > 0) {
          feeNote.textContent = `Includes a ${info.createTokenFeeSol} SOL platform fee, plus normal Solana network fees.`;
        }
      })
      .catch(() => {});
  }

  if (imageInput) {
    imageInput.addEventListener('change', () => {
      const file = imageInput.files[0];
      if (!file || !preview) return;
      preview.src = URL.createObjectURL(file);
      preview.classList.add('show');
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    resultEl.style.display = 'none';
    const owner = LaamWallet.getPublicKey();
    if (!owner) {
      setStatus(statusEl, 'error', 'Connect your Phantom wallet first.');
      return;
    }

    const name = document.getElementById('tokenName').value.trim();
    const symbol = document.getElementById('tokenSymbol').value.trim().toUpperCase();
    const decimals = parseInt(document.getElementById('tokenDecimals').value, 10);
    const supply = document.getElementById('tokenSupply').value.trim();
    const description = document.getElementById('tokenDescription').value.trim();
    const manualUri = document.getElementById('tokenMetadataUri')?.value.trim();

    if (!name || !symbol || !supply || Number.isNaN(decimals)) {
      setStatus(statusEl, 'error', 'Fill in name, symbol, decimals and supply.');
      return;
    }

    submitBtn.disabled = true;
    try {
      let uri = manualUri || '';

      if (!uri) {
        const file = imageInput?.files[0];
        setStatus(statusEl, 'info', 'Uploading metadata…');
        const fd = new FormData();
        fd.append('name', name);
        fd.append('symbol', symbol);
        fd.append('description', description);
        if (file) fd.append('image', file);

        const uploadRes = await fetch(LAAM_BACKEND_URL + '/api/metadata/upload', {
          method: 'POST',
          body: fd,
        });
        const uploadData = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok) {
          throw new Error(
            uploadData.error ||
              'Metadata upload is not configured on the backend yet. Paste a metadata URI manually below and resubmit.'
          );
        }
        uri = uploadData.uri;
      }

      setStatus(statusEl, 'info', 'Building transaction…');
      const { transaction, mint } = await postJSON('/api/token/create-transaction', {
        owner,
        name,
        symbol,
        decimals,
        supply,
        uri,
      });

      setStatus(statusEl, 'info', 'Confirm the transaction in Phantom…');
      const sig = await signAndSend(transaction);

      setStatus(statusEl, 'success', `Token created! Transaction confirmed.`);
      resultEl.style.display = 'block';
      resultEl.innerHTML = `
        <div class="result-row"><span>Mint Address</span><span>${mint}</span></div>
        <div class="result-row"><span>Transaction</span><span><a href="${explorerTxUrl(sig)}" target="_blank">${sig.slice(0, 12)}… ↗</a></span></div>
        <div class="result-row"><span>View on Solscan</span><span><a href="${explorerAddrUrl(mint)}" target="_blank">Open ↗</a></span></div>
      `;
    } catch (err) {
      setStatus(statusEl, 'error', `❌ ${err.message}`);
    } finally {
      submitBtn.disabled = false;
    }
  });
})();

/* ---------- REVOKE AUTHORITY ---------- */
(function initRevoke() {
  const form = document.getElementById('revokeForm');
  if (!form) return;

  const statusEl = document.getElementById('revokeStatus');
  const resultEl = document.getElementById('revokeResult');
  const submitBtn = document.getElementById('revokeSubmitBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    resultEl.style.display = 'none';
    const owner = LaamWallet.getPublicKey();
    if (!owner) {
      setStatus(statusEl, 'error', 'Connect your Phantom wallet first.');
      return;
    }

    const mint = document.getElementById('revokeMintAddr').value.trim();
    const revokeMint = document.getElementById('revokeMintAuth').checked;
    const revokeFreeze = document.getElementById('revokeFreezeAuth').checked;

    if (!mint) {
      setStatus(statusEl, 'error', 'Paste the token mint address.');
      return;
    }
    if (!revokeMint && !revokeFreeze) {
      setStatus(statusEl, 'error', 'Select at least one authority to revoke.');
      return;
    }

    submitBtn.disabled = true;
    try {
      setStatus(statusEl, 'info', 'Building transaction…');
      const { transaction } = await postJSON('/api/token/revoke-transaction', {
        owner,
        mint,
        revokeMint,
        revokeFreeze,
      });

      setStatus(statusEl, 'info', 'Confirm the transaction in Phantom…');
      const sig = await signAndSend(transaction);

      setStatus(statusEl, 'success', 'Authority revoked. This action is permanent and cannot be undone.');
      resultEl.style.display = 'block';
      resultEl.innerHTML = `
        <div class="result-row"><span>Mint</span><span>${mint}</span></div>
        <div class="result-row"><span>Transaction</span><span><a href="${explorerTxUrl(sig)}" target="_blank">${sig.slice(0, 12)}… ↗</a></span></div>
      `;
    } catch (err) {
      setStatus(statusEl, 'error', `❌ ${err.message}`);
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
