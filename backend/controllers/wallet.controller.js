const { PublicKey } = require('@solana/web3.js');
const { getWalletSnapshot } = require('../services/wallet.service');

async function getSnapshot(req, res, next) {
  try {
    const { address } = req.params;
    try {
      new PublicKey(address);
    } catch {
      return res.status(400).json({ error: 'Invalid Solana wallet address.' });
    }
    const snapshot = await getWalletSnapshot(address);
    res.json(snapshot);
  } catch (err) {
    next(err);
  }
}

module.exports = { getSnapshot };
