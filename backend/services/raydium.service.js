const { Raydium, TxVersion, parseTokenAccountResp } = require('@raydium-io/raydium-sdk-v2');
const { PublicKey } = require('@solana/web3.js');
const { NATIVE_MINT, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getMint } = require('@solana/spl-token');
const BN = require('bn.js');
const { getConnection, addFeeInstruction } = require('./solana.service');

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

  const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
  return {
    transactionBase64: serialized.toString('base64'),
    poolId: extInfo.address.poolId.toBase58(),
  };
}

module.exports = { buildCreateLiquidityPoolTransaction };
