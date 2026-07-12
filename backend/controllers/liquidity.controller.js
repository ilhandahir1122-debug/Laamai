/**
 * Raydium pool creation is not implemented yet — see backend/services/raydium.service.js.
 * This stub keeps the API contract stable so the frontend (liquidity.html) can be built
 * and tested end-to-end before the real SDK integration is wired in.
 */
function createPool(req, res) {
  res.status(501).json({
    error:
      'Liquidity pool creation is not implemented yet. Wire up @raydium-io/raydium-sdk in backend/services/raydium.service.js to enable this.',
  });
}

module.exports = { createPool };
