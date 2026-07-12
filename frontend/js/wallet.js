/* ===== SHARED MULTI-WALLET CONNECTOR =====
   Used by create-token.html, liquidity.html, revoke.html, dashboard.html.
   Exposes window.LaamWallet — connect/disconnect/get state.
   Supports Phantom, Solflare, Backpack, Coinbase Wallet and Trust Wallet.
   Every one of these is a non-custodial browser wallet: the private key stays
   inside the extension, this file only ever asks it to sign transactions the
   backend builds. This app never asks for, stores, or transmits a private key. */

/* Point this at your deployed Render backend, e.g. "https://laam-ai-backend.onrender.com" */
const LAAM_BACKEND_URL = window.LAAM_BACKEND_URL || 'http://localhost:4000';

/* Public mainnet-beta RPC is rate-limited — swap in a Helius/QuickNode/Alchemy URL for production. */
const LAAM_SOLANA_RPC = window.LAAM_SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const LAAM_EXPLORER_CLUSTER = ''; // '' = mainnet-beta, or '?cluster=devnet'

/* True on phones/tablets — desktop browser extensions don't exist there,
   so those wallets need a "universal link" that opens their mobile app instead. */
function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/* Opens the current page inside a wallet app's built-in browser, where it
   injects window.solana / window.solflare just like a desktop extension. */
function buildUniversalLink(base) {
  const dappUrl = encodeURIComponent(window.location.href);
  const ref = encodeURIComponent(window.location.origin);
  return `${base}/${dappUrl}?ref=${ref}`;
}

const WALLET_ADAPTERS = [
  {
    id: 'phantom',
    name: 'Phantom',
    icon: '👻',
    url: 'https://phantom.app/',
    getProvider: () =>
      window.phantom?.solana?.isPhantom ? window.phantom.solana : window.solana?.isPhantom ? window.solana : null,
    mobileDeepLink: () => buildUniversalLink('https://phantom.app/ul/browse'),
  },
  {
    id: 'solflare',
    name: 'Solflare',
    icon: '🔥',
    url: 'https://solflare.com/',
    getProvider: () => (window.solflare?.isSolflare ? window.solflare : null),
    mobileDeepLink: () => buildUniversalLink('https://solflare.com/ul/v1/browse'),
  },
  {
    id: 'backpack',
    name: 'Backpack',
    icon: '🎒',
    url: 'https://backpack.app/',
    getProvider: () => (window.backpack?.isBackpack ? window.backpack : null),
  },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    icon: '🔵',
    url: 'https://www.coinbase.com/wallet',
    getProvider: () => window.coinbaseSolana || null,
  },
  {
    id: 'trust',
    name: 'Trust Wallet',
    icon: '🛡️',
    url: 'https://trustwallet.com/',
    getProvider: () => window.trustwallet?.solana || null,
  },
];

const LaamWallet = (() => {
  let publicKey = null;
  let activeAdapterId = null;

  function listAdapters() {
    return WALLET_ADAPTERS.map((a) => ({
      id: a.id,
      name: a.name,
      icon: a.icon,
      url: a.url,
      installed: Boolean(a.getProvider()),
      opensInApp: isMobileDevice() && Boolean(a.mobileDeepLink) && !a.getProvider(),
    }));
  }

  function getAdapter(id) {
    return WALLET_ADAPTERS.find((a) => a.id === id) || null;
  }

  function getActiveProvider() {
    const adapter = getAdapter(activeAdapterId);
    return adapter ? adapter.getProvider() : null;
  }

  async function connectWith(adapterId) {
    if (window.location.protocol === 'file:') {
      throw new Error(
        'This page is open as a local file (file://). Wallet extensions cannot inject into file:// pages — serve the folder with a local server instead (e.g. "npx serve frontend") and open it via http://localhost.'
      );
    }
    const adapter = getAdapter(adapterId);
    if (!adapter) throw new Error('Unknown wallet.');
    const provider = adapter.getProvider();
    if (!provider) {
      if (isMobileDevice() && adapter.mobileDeepLink) {
        window.location.href = adapter.mobileDeepLink();
        throw new Error(`Opening ${adapter.name}… if the app doesn't open, install it first from ${adapter.url}`);
      }
      window.open(adapter.url, '_blank');
      throw new Error(`${adapter.name} was not detected in this browser. Install it, unlock it, then reload this page.`);
    }
    const resp = await provider.connect();
    publicKey = (resp?.publicKey || provider.publicKey).toString();
    activeAdapterId = adapterId;
    localStorage.setItem('laam_wallet_adapter', adapterId);
    return publicKey;
  }

  async function disconnect() {
    const provider = getActiveProvider();
    if (provider && provider.disconnect) await provider.disconnect();
    publicKey = null;
    activeAdapterId = null;
    localStorage.removeItem('laam_wallet_adapter');
  }

  function getPublicKey() {
    return publicKey;
  }

  function getActiveAdapterId() {
    return activeAdapterId;
  }

  async function signTransaction(transaction) {
    const provider = getActiveProvider();
    if (!provider) throw new Error('Wallet not connected.');
    return provider.signTransaction(transaction);
  }

  async function trySilentReconnect() {
    const lastId = localStorage.getItem('laam_wallet_adapter');
    if (!lastId) return null;
    const adapter = getAdapter(lastId);
    const provider = adapter?.getProvider();
    if (!provider) return null;
    try {
      const resp = await provider.connect({ onlyIfTrusted: true });
      publicKey = (resp?.publicKey || provider.publicKey).toString();
      activeAdapterId = lastId;
      return publicKey;
    } catch (e) {
      return null;
    }
  }

  return {
    listAdapters,
    connectWith,
    disconnect,
    getPublicKey,
    getActiveAdapterId,
    signTransaction,
    trySilentReconnect,
  };
})();

/* ===== WALLET PICKER MODAL ===== */
function ensureWalletModal() {
  let overlay = document.getElementById('walletModalOverlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'walletModalOverlay';
  overlay.className = 'wallet-modal-overlay';
  overlay.innerHTML = `
    <div class="wallet-modal">
      <div class="wallet-modal-head">
        <span>Connect a wallet</span>
        <button type="button" class="wallet-modal-close" aria-label="Close">✕</button>
      </div>
      <div class="wallet-modal-list"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeWalletModal();
  });
  overlay.querySelector('.wallet-modal-close').addEventListener('click', closeWalletModal);

  return overlay;
}

function openWalletModal(onPicked) {
  const overlay = ensureWalletModal();
  const list = overlay.querySelector('.wallet-modal-list');
  list.innerHTML = '';

  LaamWallet.listAdapters().forEach((a) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'wallet-modal-item';
    item.innerHTML = `
      <span class="wallet-modal-icon">${a.icon}</span>
      <span class="wallet-modal-name">${a.name}</span>
      <span class="wallet-modal-tag">${a.installed ? 'Detected' : a.opensInApp ? 'Open in App' : 'Install'}</span>
    `;
    item.addEventListener('click', () => {
      closeWalletModal();
      onPicked(a.id);
    });
    list.appendChild(item);
  });

  overlay.classList.add('open');
}

function closeWalletModal() {
  const overlay = document.getElementById('walletModalOverlay');
  if (overlay) overlay.classList.remove('open');
}

/* Wires up any element with [data-wallet-connect] / [data-wallet-dot] / [data-wallet-addr] on the page. */
function initWalletBar() {
  const btn = document.querySelector('[data-wallet-connect]');
  const statusDot = document.querySelector('[data-wallet-dot]');
  const statusText = document.querySelector('[data-wallet-addr]');
  const walletBar = document.querySelector('.wallet-bar');

  if (window.location.protocol === 'file:' && walletBar) {
    const warning = document.createElement('div');
    warning.className = 'status-box show error';
    warning.style.maxWidth = '720px';
    warning.style.margin = '0 auto 16px';
    warning.innerHTML =
      '⚠️ This page is open as a local file (file://). Wallet extensions cannot connect on file:// pages. Serve this folder with a local server instead — e.g. run <code>npx serve frontend</code> in a terminal and open <code>http://localhost:3000</code>.';
    walletBar.parentNode.insertBefore(warning, walletBar);
  }

  function render() {
    const pk = LaamWallet.getPublicKey();
    if (pk) {
      const adapter = LaamWallet.getActiveAdapterId();
      const label = WALLET_ADAPTERS.find((a) => a.id === adapter);
      if (btn) btn.textContent = 'Disconnect';
      if (statusDot) statusDot.classList.add('connected');
      if (statusText) statusText.textContent = `${label ? label.icon + ' ' : ''}${pk.slice(0, 4)}…${pk.slice(-4)}`;
    } else {
      if (btn) btn.textContent = 'Connect Wallet';
      if (statusDot) statusDot.classList.remove('connected');
      if (statusText) statusText.textContent = 'Not connected';
    }
  }

  async function pickAndConnect(adapterId) {
    console.log('[LaamWallet] connecting with', adapterId);
    if (btn) btn.disabled = true;
    try {
      await LaamWallet.connectWith(adapterId);
    } catch (e) {
      console.error('[LaamWallet] connect failed:', e);
      if (statusText) statusText.textContent = e.message;
      alert(e.message);
    } finally {
      if (btn) btn.disabled = false;
      render();
      document.dispatchEvent(new CustomEvent('laam-wallet-changed'));
    }
  }

  if (btn) {
    btn.addEventListener('click', async () => {
      if (LaamWallet.getPublicKey()) {
        await LaamWallet.disconnect();
        render();
        document.dispatchEvent(new CustomEvent('laam-wallet-changed'));
        return;
      }
      openWalletModal(pickAndConnect);
    });
  } else {
    console.error('[LaamWallet] No element with [data-wallet-connect] found on this page — the connect button will not work.');
  }

  LaamWallet.trySilentReconnect().then(() => {
    render();
    document.dispatchEvent(new CustomEvent('laam-wallet-changed'));
  });
}

document.addEventListener('DOMContentLoaded', initWalletBar);

/* ===== SHARED HELPERS (used by token.js and liquidity.js) ===== */
function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function setStatus(el, type, html) {
  if (!el) return;
  el.className = 'status-box show ' + type;
  el.innerHTML = html;
}

function explorerTxUrl(sig) {
  return `https://solscan.io/tx/${sig}${LAAM_EXPLORER_CLUSTER}`;
}
function explorerAddrUrl(addr) {
  return `https://solscan.io/account/${addr}${LAAM_EXPLORER_CLUSTER}`;
}

async function signAndSend(txBase64) {
  const solanaWeb3 = window.solanaWeb3;
  const connection = new solanaWeb3.Connection(LAAM_SOLANA_RPC, 'confirmed');
  const tx = solanaWeb3.Transaction.from(base64ToBytes(txBase64));
  const signed = await LaamWallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

async function postJSON(path, body) {
  const res = await fetch(LAAM_BACKEND_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
