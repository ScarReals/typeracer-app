const {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  Transaction,
} = require("@solana/web3.js");
const { getEscrowPDA } = require("./pda");
const anchor = require("@coral-xyz/anchor");

// discriminator for "resolve" instruction from IDL
const RESOLVE_DISCRIMINATOR = Buffer.from([246, 150, 236, 206, 108, 63, 58, 10]);

function encodeResolveInstruction(winnerPubkey) {
  const buffer = Buffer.alloc(RESOLVE_DISCRIMINATOR.length + 32);
  RESOLVE_DISCRIMINATOR.copy(buffer, 0);
  Buffer.from(winnerPubkey.toBytes()).copy(buffer, 8);
  return buffer;
}

async function resolveEscrow({ connection, escrow, winner, house, houseKeypair }) {
  const escrowAccount = await connection.getAccountInfo(escrow);
  if (!escrowAccount) throw new Error("Escrow account not found");

  const programId = new PublicKey(process.env.PROGRAM_ID); // make sure this is set in .env
  const escrowPda = escrow;
  const escrowData = await connection.getAccountInfo(escrowPda);

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: winner, isSigner: false, isWritable: true },
      { pubkey: house, isSigner: false, isWritable: true },
      { pubkey: new PublicKey(escrowData.owner), isSigner: false, isWritable: true },
      { pubkey: houseKeypair.publicKey, isSigner: true, isWritable: true }
    ],
    programId,
    data: encodeResolveInstruction(winner)
  });

  const tx = new Transaction().add(ix);
  const sig = await connection.sendTransaction(tx, [houseKeypair]);
  return sig;
}

module.exports = { resolveEscrow };
