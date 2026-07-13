const { submitSignedTransaction } = require('../services/solana.service');

async function submit(req, res, next) {
  try {
    const { transaction } = req.body;
    if (!transaction || typeof transaction !== 'string') {
      return res.status(400).json({ error: 'A base64-encoded signed transaction is required.' });
    }
    const signature = await submitSignedTransaction(transaction);
    res.json({ signature });
  } catch (err) {
    next(err);
  }
}

module.exports = { submit };
