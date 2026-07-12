const SERVICE_FEE_WALLET = process.env.SERVICE_FEE_WALLET || '';
const CREATE_TOKEN_FEE_SOL = parseFloat(process.env.CREATE_TOKEN_FEE_SOL || '0');
const LIQUIDITY_FEE_SOL = parseFloat(process.env.LIQUIDITY_FEE_SOL || '0');

function getFeeInfo(req, res) {
  res.json({
    feeWallet: SERVICE_FEE_WALLET || null,
    createTokenFeeSol: SERVICE_FEE_WALLET ? CREATE_TOKEN_FEE_SOL : 0,
    liquidityFeeSol: SERVICE_FEE_WALLET ? LIQUIDITY_FEE_SOL : 0,
    note: 'Fees, if enabled, are added as a normal SOL transfer inside the same transaction you sign — the backend never moves funds on its own.',
  });
}

module.exports = { getFeeInfo };
