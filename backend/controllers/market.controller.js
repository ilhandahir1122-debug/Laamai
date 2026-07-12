const { getMarketStats } = require('../services/market.service');

async function getStats(req, res, next) {
  try {
    const stats = await getMarketStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

module.exports = { getStats };
