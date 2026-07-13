const { PublicKey } = require('@solana/web3.js');
const { buildCreateLiquidityPoolTransaction } = require('../services/raydium.service');

function isValidPubkey(value) {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

async function createPool(req, res, next) {
  try {
    const { owner, mint, tokenAmount, solAmount } = req.body;

    if (!owner || !isValidPubkey(owner)) {
      return res.status(400).json({ error: 'A valid owner wallet address is required.' });
    }
    if (!mint || !isValidPubkey(mint)) {
      return res.status(400).json({ error: 'A valid token mint address is required.' });
    }
    const tAmount = Number(tokenAmount);
    const sAmount = Number(solAmount);
    if (!(tAmount > 0)) {
      return res.status(400).json({ error: 'tokenAmount must be a positive number.' });
    }
    if (!(sAmount > 0)) {
      return res.status(400).json({ error: 'solAmount must be a positive number.' });
    }

    const { transactionBase64, poolId } = await buildCreateLiquidityPoolTransaction({
      ownerAddress: owner,
      mintAddress: mint,
      tokenAmount: tAmount,
      solAmount: sAmount,
    });

    res.json({ transaction: transactionBase64, poolId });
  } catch (err) {
    next(err);
  }
}

module.exports = { createPool };
