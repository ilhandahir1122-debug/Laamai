const crypto = require('crypto');
const {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} = require('@solana/web3.js');
const {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
  createInitializeMintInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  AuthorityType,
} = require('@solana/spl-token');
const {
  createCreateMetadataAccountV3Instruction,
  PROGRAM_ID: TOKEN_METADATA_PROGRAM_ID,
  Metadata,
  Key: MetadataKey,
} = require('@metaplex-foundation/mpl-token-metadata');
const { getMint, ACCOUNT_SIZE, getMinimumBalanceForRentExemptAccount } = require('@solana/spl-token');

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const SERVICE_FEE_WALLET = process.env.SERVICE_FEE_WALLET || '';
const CREATE_TOKEN_FEE_SOL = parseFloat(process.env.CREATE_TOKEN_FEE_SOL || '0');

function getConnection() {
  return new Connection(RPC_URL, 'confirmed');
}

function findMetadataPda(mint) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

/** Looks up a token's on-chain name/symbol/decimals, e.g. to show "LAAM / SOL"
 *  as soon as a user pastes a mint address instead of a bare address. */
async function getTokenInfo(mintAddress) {
  const connection = getConnection();
  const mint = new PublicKey(mintAddress);

  const mintInfo = await getMint(connection, mint);

  let name = null;
  let symbol = null;
  try {
    const metadataPda = findMetadataPda(mint);
    const metadata = await Metadata.fromAccountAddress(connection, metadataPda);
    name = metadata.data.name.replace(/\0/g, '').trim();
    symbol = metadata.data.symbol.replace(/\0/g, '').trim();
  } catch {
    // No Metaplex metadata account — token exists but has no on-chain name/symbol.
  }

  return {
    mint: mintAddress,
    name,
    symbol,
    decimals: mintInfo.decimals,
    supply: mintInfo.supply.toString(),
  };
}

/**
 * Best-effort SOL cost estimate via simulation — diffs the owner's balance
 * before/after. Only accurate when the owner already has enough SOL for the
 * simulation to fully succeed (a wallet that's short will make the sim fail
 * partway through and return null) — used for Raydium instructions we don't
 * construct ourselves, so we can't sum their rent costs directly. For token
 * creation, which we build instruction-by-instruction, see
 * estimateCreateTokenCostSol below instead — it's exact regardless of balance.
 */
async function estimateOwnerCostSol(connection, transaction, owner) {
  try {
    const preBalance = await connection.getBalance(owner);
    // Legacy Transaction overload takes positional args, not a config object:
    // (transaction, signers?, includeAccounts?) — no signers means sigVerify is skipped.
    const sim = await connection.simulateTransaction(transaction, undefined, [owner]);
    if (sim.value.err) return null;
    const postAccount = sim.value.accounts?.[0];
    const postBalance = postAccount ? postAccount.lamports : preBalance;
    return (preBalance - postBalance) / 1e9;
  } catch {
    return null;
  }
}

/** Exact SOL cost to create a token — sums real rent-exemption minimums for
 *  every new account plus the platform fee and the one signature's network
 *  fee. Computed the same way regardless of the caller's current balance,
 *  so it works even for a wallet with 0 SOL (e.g. before they've funded it). */
async function estimateCreateTokenCostSol({ connection, owner, mint, name, symbol, uri, mintRentLamports }) {
  const ataRent = await getMinimumBalanceForRentExemptAccount(connection);

  const metadataArgs = {
    key: MetadataKey.MetadataV1,
    updateAuthority: owner,
    mint,
    data: { name, symbol, uri, sellerFeeBasisPoints: 0, creators: null },
    primarySaleHappened: false,
    isMutable: true,
    editionNonce: null,
    tokenStandard: null,
    collection: null,
    uses: null,
    collectionDetails: null,
    programmableConfig: null,
  };
  const metadataRent = await Metadata.getMinimumBalanceForRentExemption(metadataArgs, connection);

  const feeLamports = Math.round(CREATE_TOKEN_FEE_SOL * 1e9);
  const networkFeeLamports = 5000; // one signature (owner) at the standard 5000 lamports/sig

  return (mintRentLamports + ataRent + metadataRent + feeLamports + networkFeeLamports) / 1e9;
}

/** Adds a plain SOL transfer to the admin fee wallet inside the same transaction
 *  the owner signs — the backend never moves funds outside a tx the user approves. */
function addFeeInstruction(tx, ownerPubkey, feeSol) {
  if (SERVICE_FEE_WALLET && feeSol > 0) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: ownerPubkey,
        toPubkey: new PublicKey(SERVICE_FEE_WALLET),
        lamports: Math.round(feeSol * 1e9),
      })
    );
  }
}

/**
 * Builds an unsigned transaction that creates a new SPL token mint,
 * an associated token account for the owner, mints the initial supply,
 * and writes Metaplex on-chain metadata. feePayer = owner, so the owner's
 * wallet signs and pays for it client-side — this backend never holds the
 * owner's keys. The mint account is derived deterministically from the
 * owner's own pubkey + a random seed via createAccountWithSeed, so ONLY the
 * owner needs to sign — no second (ephemeral keypair) signature is required.
 * This avoids a real-world bug where some wallets (e.g. OKX) don't correctly
 * preserve a pre-existing signature from a second signer when adding theirs,
 * which corrupts the transaction and shows as "Unknown transaction" / a
 * bogus "insufficient balance" warning.
 */
async function buildCreateTokenTransaction({ ownerAddress, name, symbol, decimals, supply, uri }) {
  const connection = getConnection();
  const owner = new PublicKey(ownerAddress);
  const seed = crypto.randomBytes(16).toString('hex').slice(0, 32);
  const mint = await PublicKey.createWithSeed(owner, seed, TOKEN_PROGRAM_ID);

  const lamportsForMint = await getMinimumBalanceForRentExemptMint(connection);
  const ata = getAssociatedTokenAddressSync(mint, owner);
  const metadataPda = findMetadataPda(mint);

  const rawSupply = BigInt(supply) * BigInt(10) ** BigInt(decimals);

  const tx = new Transaction();

  tx.add(
    SystemProgram.createAccountWithSeed({
      fromPubkey: owner,
      newAccountPubkey: mint,
      basePubkey: owner,
      seed,
      space: MINT_SIZE,
      lamports: lamportsForMint,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(mint, decimals, owner, owner, TOKEN_PROGRAM_ID),
    createAssociatedTokenAccountInstruction(owner, ata, owner, mint),
    createMintToInstruction(mint, ata, owner, rawSupply),
    createCreateMetadataAccountV3Instruction(
      {
        metadata: metadataPda,
        mint,
        mintAuthority: owner,
        payer: owner,
        updateAuthority: owner,
      },
      {
        createMetadataAccountArgsV3: {
          data: {
            name,
            symbol,
            uri,
            sellerFeeBasisPoints: 0,
            creators: null,
            collection: null,
            uses: null,
          },
          isMutable: true,
          collectionDetails: null,
        },
      }
    )
  );

  addFeeInstruction(tx, owner, CREATE_TOKEN_FEE_SOL);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = owner;

  const estimatedCostSol = await estimateCreateTokenCostSol({
    connection,
    owner,
    mint,
    name,
    symbol,
    uri,
    mintRentLamports: lamportsForMint,
  });

  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  return { transactionBase64: serialized.toString('base64'), mint: mint.toBase58(), estimatedCostSol };
}

/**
 * Builds an unsigned transaction that revokes the mint and/or freeze
 * authority of an existing token. feePayer = owner, who must currently
 * hold the authority being revoked — Phantom signs this client-side too.
 */
async function buildRevokeAuthorityTransaction({ ownerAddress, mintAddress, revokeMint, revokeFreeze }) {
  const connection = getConnection();
  const owner = new PublicKey(ownerAddress);
  const mint = new PublicKey(mintAddress);

  const tx = new Transaction();

  if (revokeMint) {
    tx.add(
      createSetAuthorityInstruction(mint, owner, AuthorityType.MintTokens, null, [], TOKEN_PROGRAM_ID)
    );
  }
  if (revokeFreeze) {
    tx.add(
      createSetAuthorityInstruction(mint, owner, AuthorityType.FreezeAccount, null, [], TOKEN_PROGRAM_ID)
    );
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = owner;

  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  return { transactionBase64: serialized.toString('base64') };
}

/**
 * Submits a fully-signed transaction (built + signed entirely client-side by
 * the user's wallet) and waits for confirmation. This runs server-to-server,
 * which avoids the 403s public Solana RPC endpoints return for direct
 * browser/mobile-app requests (they key off the Origin header, which
 * server-to-server calls never send).
 */
async function submitSignedTransaction(signedTransactionBase64) {
  const connection = getConnection();
  const raw = Buffer.from(signedTransactionBase64, 'base64');
  const tx = Transaction.from(raw);
  const signature = await connection.sendRawTransaction(raw, { skipPreflight: false });
  const lastValidBlockHeight =
    tx.lastValidBlockHeight ?? (await connection.getLatestBlockhash('confirmed')).lastValidBlockHeight;
  await connection.confirmTransaction(
    { signature, blockhash: tx.recentBlockhash, lastValidBlockHeight },
    'confirmed'
  );
  return signature;
}

module.exports = {
  getConnection,
  buildCreateTokenTransaction,
  buildRevokeAuthorityTransaction,
  addFeeInstruction,
  submitSignedTransaction,
  getTokenInfo,
  estimateOwnerCostSol,
  SERVICE_FEE_WALLET,
  CREATE_TOKEN_FEE_SOL,
};
