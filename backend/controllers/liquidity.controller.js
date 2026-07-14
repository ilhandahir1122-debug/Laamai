const { PublicKey } = require('@solana/web3.js');
const { buildCreateMeteoraPoolTransaction } = require('../services/meteora.service');
const { buildLockLiquidityTransaction } = require('../services/raydium.service');

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

    const { transactionBase64, poolId, estimatedCostSol } = await buildCreateMeteoraPoolTransaction({
      ownerAddress: owner,
      mintAddress: mint,
      tokenAmount: tAmount,
      solAmount: sAmount,
    });

    res.json({ transaction: transactionBase64, poolId, estimatedCostSol, autoLocked: true });
  } catch (err) {
    next(err);
  }
}

async function lockPool(req, res, next) {
  try {
    const { owner, poolId } = req.body;

    if (!owner || !isValidPubkey(owner)) {
      return res.status(400).json({ error: 'A valid owner wallet address is required.' });
    }
    if (!poolId || !isValidPubkey(poolId)) {
      return res.status(400).json({ error: 'A valid pool ID is required.' });
    }

    const { transactionBase64, nftMint, estimatedCostSol } = await buildLockLiquidityTransaction({
      ownerAddress: owner,
      poolId,
    });

    res.json({ transaction: transactionBase64, nftMint, estimatedCostSol });
  } catch (err) {
    next(err);
  }
}

module.exports = { createPool, lockPool };
