const { Raydium, TxVersion, parseTokenAccountResp } = require('@raydium-io/raydium-sdk-v2');
const { CpmmPoolInfoLayout } = require('@raydium-io/raydium-sdk-v2/lib/raydium/cpmm/layout.js');
const { PublicKey, Keypair } = require('@solana/web3.js');
const {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getMinimumBalanceForRentExemptMint,
  getMinimumBalanceForRentExemptAccount,
} = require('@solana/spl-token');
const BN = require('bn.js');
const { getConnection, addFeeInstruction, estimateOwnerCostSol } = require('./solana.service');

// Mainnet Raydium CPMM program (no OpenBook market needed, unlike the legacy AMM v4 —
// this is why a pool can be created for a few hundredths of a SOL instead of several SOL).
const CREATE_CPMM_POOL_PROGRAM = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');
const CREATE_CPMM_POOL_FEE_ACC = new PublicKey('DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8');

const LIQUIDITY_FEE_SOL = parseFloat(process.env.LIQUIDITY_FEE_SOL || '0');

/** Loads the owner's real token accounts and feeds them into the SDK explicitly.
 *  Required: the SDK's own auto-fetch has no mint filter and needs an existing
 *  token account to deposit an existing balance from (it won't find your ATA
 *  otherwise), so without this step pool creation fails with a "you don't
 *  have some token account" error even when you do hold the token. */
async function primeOwnerTokenAccounts(raydium, connection, owner) {
  const [solAccountResp, tokenAccountResp, token2022Resp] = await Promise.all([
    connection.getAccountInfo(owner),
    connection.getTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
    connection.getTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);
  const { tokenAccounts, tokenAccountRawInfos } = parseTokenAccountResp({
    owner,
    solAccountResp,
    tokenAccountResp: {
      context: tokenAccountResp.context,
      value: [...tokenAccountResp.value, ...token2022Resp.value],
    },
  });
  raydium.account.updateTokenAccount({ tokenAccounts, tokenAccountRawInfos });
}

/**
 * Deterministic fallback used only when live simulation can't run (the
 * owner's current balance is already too low for the simulator to finish).
 * Sums the pieces we know exactly — LP mint + 2 vault accounts + pool state
 * rent, Raydium's own protocol fee for creating a pool, our platform fee,
 * one signature's network fee, and the SOL amount being deposited — so a
 * wallet that's short still sees a concrete number instead of nothing.
 * Slightly conservative: Raydium's "observation" account rent isn't in this
 * sum (its size isn't exposed by the SDK), so add a small buffer mentally.
 */
async function estimateCreatePoolCostSolFallback({ connection, solAmount, createPoolFeeLamports }) {
  const [mintRent, vaultRent] = await Promise.all([
    getMinimumBalanceForRentExemptMint(connection),
    getMinimumBalanceForRentExemptAccount(connection),
  ]);
  const poolStateRent = await connection.getMinimumBalanceForRentExemption(CpmmPoolInfoLayout.span);

  const feeLamports = Math.round(LIQUIDITY_FEE_SOL * 1e9);
  const networkFeeLamports = 5000;
  const depositLamports = Math.round(solAmount * 1e9);

  const totalLamports =
    mintRent + vaultRent * 2 + poolStateRent + createPoolFeeLamports + feeLamports + networkFeeLamports + depositLamports;

  return totalLamports / 1e9;
}

/**
 * Builds an unsigned transaction that creates a Raydium CPMM pool pairing the
 * caller's SPL token with native SOL. feePayer = owner, same non-custodial
 * pattern as token creation — the owner's wallet signs and pays client-side.
 * Every account the pool needs (pool state, LP mint, vaults) is a Program
 * Derived Address, not a fresh keypair, so — like token creation — only the
 * owner needs to sign; no second signer that some wallets mishandle.
 */
async function buildCreateLiquidityPoolTransaction({ ownerAddress, mintAddress, tokenAmount, solAmount }) {
  const connection = getConnection();
  const owner = new PublicKey(ownerAddress);
  const mintPubkey = new PublicKey(mintAddress);

  const mintInfo = await getMint(connection, mintPubkey);
  const tokenDecimals = mintInfo.decimals;

  const raydium = await Raydium.load({
    owner,
    connection,
    cluster: 'mainnet',
    disableFeatureCheck: true,
    disableLoadToken: true,
    blockhashCommitment: 'confirmed',
  });

  await primeOwnerTokenAccounts(raydium, connection, owner);

  const mintA = { address: mintAddress, decimals: tokenDecimals, programId: TOKEN_PROGRAM_ID.toBase58() };
  const mintB = { address: NATIVE_MINT.toBase58(), decimals: 9, programId: TOKEN_PROGRAM_ID.toBase58() };

  const feeConfigs = await raydium.api.getCpmmConfigs();
  if (!feeConfigs?.length) throw new Error('Could not load Raydium pool fee configs.');

  const mintAAmount = new BN(Math.round(tokenAmount * 10 ** tokenDecimals).toString());
  const mintBAmount = new BN(Math.round(solAmount * 1e9).toString());

  const { transaction, extInfo } = await raydium.cpmm.createPool({
    programId: CREATE_CPMM_POOL_PROGRAM,
    poolFeeAccount: CREATE_CPMM_POOL_FEE_ACC,
    mintA,
    mintB,
    mintAAmount,
    mintBAmount,
    startTime: new BN(0),
    feeConfig: feeConfigs[0],
    associatedOnly: true,
    ownerInfo: { useSOLBalance: true },
    txVersion: TxVersion.LEGACY,
  });

  addFeeInstruction(transaction, owner, LIQUIDITY_FEE_SOL);

  transaction.feePayer = owner;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;

  let estimatedCostSol = await estimateOwnerCostSol(connection, transaction, owner);
  if (estimatedCostSol === null) {
    estimatedCostSol = await estimateCreatePoolCostSolFallback({
      connection,
      solAmount,
      createPoolFeeLamports: Number(feeConfigs[0].createPoolFee),
    });
  }

  const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
  return {
    transactionBase64: serialized.toString('base64'),
    poolId: extInfo.address.poolId.toBase58(),
    estimatedCostSol,
    raydiumProtocolFeeSol: Number(feeConfigs[0].createPoolFee) / 1e9,
  };
}

/**
 * Builds an unsigned transaction that permanently locks 100% of the owner's
 * LP tokens for a pool — proof the liquidity can never be pulled (no rug).
 * Raydium's lock program mints a small "position NFT" as a receipt, which
 * needs a fresh keypair to sign the mint's creation (unlike our own token
 * mint, this is Raydium's own program design, not something we control) —
 * generated here and partial-signed server-side, same safe pattern used
 * before: the ephemeral key's only power is naming that one account, its
 * authority belongs to Raydium's lock program, and it's discarded after use.
 */
async function buildLockLiquidityTransaction({ ownerAddress, poolId }) {
  const connection = getConnection();
  const owner = new PublicKey(ownerAddress);

  const raydium = await Raydium.load({
    owner,
    connection,
    cluster: 'mainnet',
    disableFeatureCheck: true,
    disableLoadToken: true,
    blockhashCommitment: 'confirmed',
  });

  await primeOwnerTokenAccounts(raydium, connection, owner);

  let poolInfo;
  try {
    ({ poolInfo } = await raydium.cpmm.getPoolInfoFromRpc(poolId));
  } catch {
    const err = new Error('No Raydium pool found for that pool ID.');
    err.status = 400;
    throw err;
  }
  const lpBalance = raydium.account.tokenAccounts.find((a) => a.mint.toBase58() === poolInfo.lpMint.address);
  if (!lpBalance || lpBalance.amount.isZero()) {
    const err = new Error("This wallet doesn't hold any LP tokens for that pool.");
    err.status = 400;
    throw err;
  }

  const nftMintKeypair = Keypair.generate();

  const { transaction, extInfo } = await raydium.cpmm.lockLp({
    poolInfo,
    lpAmount: lpBalance.amount,
    withMetadata: true,
    txVersion: TxVersion.LEGACY,
    getEphemeralSigners: async () => [nftMintKeypair.publicKey],
  });

  transaction.feePayer = owner;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.partialSign(nftMintKeypair);

  const estimatedCostSol = await estimateOwnerCostSol(connection, transaction, owner);

  const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
  return {
    transactionBase64: serialized.toString('base64'),
    nftMint: extInfo.nftMint.toBase58(),
    estimatedCostSol,
  };
}

module.exports = { buildCreateLiquidityPoolTransaction, buildLockLiquidityTransaction };
