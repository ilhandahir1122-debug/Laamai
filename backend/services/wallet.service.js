const { PublicKey } = require('@solana/web3.js');
const { getConnection } = require('./solana.service');
const { LAAM_MINT } = require('./market.service');

/** Real on-chain lookup — runs server-side against the backend's own RPC
 *  connection, avoiding the browser CORS/rate-limit blocks public RPCs impose. */
async function getWalletSnapshot(address) {
  const owner = new PublicKey(address); // throws for invalid addresses
  const connection = getConnection();

  const [solBalanceLamports, tokenAccounts, signatures] = await Promise.all([
    connection.getBalance(owner),
    connection.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(LAAM_MINT) }),
    connection.getSignaturesForAddress(owner, { limit: 50 }),
  ]);

  const laamAccount = tokenAccounts.value[0];
  const laamBalance = laamAccount
    ? laamAccount.account.data.parsed.info.tokenAmount.uiAmount ?? 0
    : 0;

  return {
    address,
    solBalance: solBalanceLamports / 1e9,
    laamBalance,
    txCount: signatures.length >= 50 ? '50+' : signatures.length,
  };
}

module.exports = { getWalletSnapshot };
