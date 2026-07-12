const { PublicKey } = require('@solana/web3.js');
const { buildCreateTokenTransaction, buildRevokeAuthorityTransaction } = require('../services/solana.service');

function isValidPubkey(value) {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

async function createTransaction(req, res, next) {
  try {
    const { owner, name, symbol, decimals, supply, uri } = req.body;

    if (!owner || !isValidPubkey(owner)) {
      return res.status(400).json({ error: 'A valid owner wallet address is required.' });
    }
    if (!name || typeof name !== 'string' || name.length > 32) {
      return res.status(400).json({ error: 'Token name is required (max 32 characters).' });
    }
    if (!symbol || typeof symbol !== 'string' || symbol.length > 10) {
      return res.status(400).json({ error: 'Token symbol is required (max 10 characters).' });
    }
    const dec = Number(decimals);
    if (!Number.isInteger(dec) || dec < 0 || dec > 9) {
      return res.status(400).json({ error: 'Decimals must be an integer between 0 and 9.' });
    }
    let supplyBig;
    try {
      supplyBig = BigInt(supply);
      if (supplyBig <= 0n) throw new Error();
    } catch {
      return res.status(400).json({ error: 'Supply must be a positive whole number.' });
    }
    if (!uri || typeof uri !== 'string') {
      return res.status(400).json({ error: 'A metadata URI is required.' });
    }

    const { transactionBase64, mint } = await buildCreateTokenTransaction({
      ownerAddress: owner,
      name,
      symbol,
      decimals: dec,
      supply: supplyBig.toString(),
      uri,
    });

    res.json({ transaction: transactionBase64, mint });
  } catch (err) {
    next(err);
  }
}

async function revokeTransaction(req, res, next) {
  try {
    const { owner, mint, revokeMint, revokeFreeze } = req.body;

    if (!owner || !isValidPubkey(owner)) {
      return res.status(400).json({ error: 'A valid owner wallet address is required.' });
    }
    if (!mint || !isValidPubkey(mint)) {
      return res.status(400).json({ error: 'A valid token mint address is required.' });
    }
    if (!revokeMint && !revokeFreeze) {
      return res.status(400).json({ error: 'Select at least one authority to revoke.' });
    }

    const { transactionBase64 } = await buildRevokeAuthorityTransaction({
      ownerAddress: owner,
      mintAddress: mint,
      revokeMint: Boolean(revokeMint),
      revokeFreeze: Boolean(revokeFreeze),
    });

    res.json({ transaction: transactionBase64 });
  } catch (err) {
    next(err);
  }
}

module.exports = { createTransaction, revokeTransaction };
