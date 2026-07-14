const {
  CpAmm,
  getBaseFeeParams,
  BaseFeeMode,
  ActivationType,
  CollectFeeMode,
  MIN_SQRT_PRICE,
  MAX_SQRT_PRICE,
  getOrCreateATAInstruction,
  wrapSOLInstruction,
} = require('@meteora-ag/cp-amm-sdk');
const { PublicKey, Keypair } = require('@solana/web3.js');
const { NATIVE_MINT, TOKEN_PROGRAM_ID, getMint } = require('@solana/spl-token');
const BN = require('bn.js');
const { getConnection, addFeeInstruction, estimateOwnerCostSol } = require('./solana.service');

const LIQUIDITY_FEE_SOL = parseFloat(process.env.LIQUIDITY_FEE_SOL || '0');

/**
 * Builds an unsigned transaction that creates a Meteora DAMM v2 pool pairing
 * the caller's SPL token with native SOL. Meteora charges no protocol fee for
 * pool creation (unlike Raydium's fixed 0.15 SOL) — the only cost is Solana
 * rent for the new accounts, roughly 0.02 SOL, plus our own platform fee.
 * Same non-custodial pattern as everywhere else: feePayer = owner, the
 * owner's wallet signs client-side. Meteora's lock-position design needs a
 * fresh "position NFT" mint to sign alongside the owner (its authority
 * belongs to the pool program, not to us — generated here and discarded
 * after signing, same pattern used for Raydium's liquidity lock).
 */
async function buildCreateMeteoraPoolTransaction({ ownerAddress, mintAddress, tokenAmount, solAmount }) {
  const connection = getConnection();
  const owner = new PublicKey(ownerAddress);
  const tokenMint = new PublicKey(mintAddress);

  const mintInfo = await getMint(connection, tokenMint);
  const decimals = mintInfo.decimals;

  const cpAmm = new CpAmm(connection);

  const tokenAAmount = new BN(Math.round(tokenAmount * 10 ** decimals).toString());
  const tokenBAmount = new BN(Math.round(solAmount * 1e9).toString());

  const { initSqrtPrice, liquidityDelta } = cpAmm.preparePoolCreationParams({
    tokenAAmount,
    tokenBAmount,
    minSqrtPrice: MIN_SQRT_PRICE,
    maxSqrtPrice: MAX_SQRT_PRICE,
    collectFeeMode: CollectFeeMode.OnlyB,
  });

  // Flat 1% swap fee (startingFeeBps === endingFeeBps means it never changes over time).
  const baseFee = getBaseFeeParams(
    {
      baseFeeMode: BaseFeeMode.FeeTimeSchedulerLinear,
      feeTimeSchedulerParam: {
        startingFeeBps: 100,
        endingFeeBps: 100,
        numberOfPeriod: 0,
        totalDuration: 0,
      },
    },
    9,
    ActivationType.Timestamp
  );

  const poolFees = {
    baseFee,
    compoundingFeeBps: 0,
    padding: 0,
    dynamicFee: null,
  };

  const positionNftMint = Keypair.generate();

  const { ataPubkey: wsolAta, ix: createWsolAtaIx } = await getOrCreateATAInstruction(
    NATIVE_MINT,
    owner,
    owner,
    false,
    TOKEN_PROGRAM_ID
  );
  const wrapIxs = wrapSOLInstruction(owner, wsolAta, BigInt(tokenBAmount.toString()));

  const { tx, pool } = await cpAmm.createCustomPool({
    payer: owner,
    creator: owner,
    positionNft: positionNftMint.publicKey,
    tokenAMint: tokenMint,
    tokenBMint: NATIVE_MINT,
    tokenAAmount,
    tokenBAmount,
    sqrtMinPrice: MIN_SQRT_PRICE,
    sqrtMaxPrice: MAX_SQRT_PRICE,
    initSqrtPrice,
    liquidityDelta,
    poolFees,
    hasAlphaVault: false,
    activationType: ActivationType.Timestamp,
    collectFeeMode: CollectFeeMode.OnlyB,
    activationPoint: null,
    tokenAProgram: TOKEN_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID,
    // Permanently locks the liquidity position at creation — no separate lock
    // step needed, and no way for anyone (including us) to ever pull it out.
    isLockLiquidity: true,
  });

  const prependIxs = createWsolAtaIx ? [createWsolAtaIx, ...wrapIxs] : wrapIxs;
  tx.instructions.unshift(...prependIxs);

  addFeeInstruction(tx, owner, LIQUIDITY_FEE_SOL);

  tx.feePayer = owner;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.partialSign(positionNftMint);

  const estimatedCostSol = await estimateOwnerCostSol(connection, tx, owner);

  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  return {
    transactionBase64: serialized.toString('base64'),
    poolId: pool.toBase58(),
    estimatedCostSol,
  };
}

module.exports = { buildCreateMeteoraPoolTransaction };
