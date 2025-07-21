import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import idl from "./idl/typeracer_escrow.json";
import { PROGRAM_ID, getProvider } from "./solana";

function getProgram() {
  const provider = getProvider();
  return new anchor.Program(idl, PROGRAM_ID, provider);
}

/**
 * 1) Initialize + deposit (now calls your on‑chain `deposit` so
 *    p1_deposited flips true in Rust).
 */
export async function buildInitializeAndDepositIxns(
  lamports,
  initializerPubkey,
  nonce
) {
  const program = getProgram();
  const nonceBuf = Buffer.from(new anchor.BN(nonce).toArray("le", 8));
  const [escrowPda] = await PublicKey.findProgramAddress(
    [Buffer.from("escrow"), initializerPubkey.toBuffer(), nonceBuf],
    PROGRAM_ID
  );

  // initialize
  const ixInit = await program.methods
    .initialize(new anchor.BN(lamports), new anchor.BN(nonce))
    .accounts({
      escrow:         escrowPda,
      player1:        initializerPubkey,
      authority:      initializerPubkey,
      system_program: SystemProgram.programId,
    })
    .instruction();

  // **on‑chain** deposit (flips p1_deposited)
  const ixDeposit = await program.methods
    .deposit()
    .accounts({
      escrow:         escrowPda,
      payer:          initializerPubkey,
      escrow_account: escrowPda,
      system_program: SystemProgram.programId,
    })
    .instruction();

  return { ixInit, ixDeposit, escrowPda };
}

/**
 * 2) Join & deposit
 */
export async function buildJoinAndDepositIxn(escrowId) {
  const program   = getProgram();
  const provider  = getProvider();
  const escrowPda = new PublicKey(escrowId);

  return program.methods
    .joinAndDeposit()
    .accounts({
      escrow:         escrowPda,
      player2:        provider.wallet.publicKey,
      escrow_account: escrowPda,
      system_program: SystemProgram.programId,
    })
    .instruction();
}

/**
 * 3) Cancel
 */
export async function buildCancelIxn(escrowId, player1Pubkey, player2Pubkey) {
  const ESCROW_PDA = new PublicKey(escrowId);
  const P1 = new PublicKey(player1Pubkey);
  const P2 = new PublicKey(player2Pubkey);

  // hard‑code the 8 bytes for `cancel`
  const CANCEL_DISCRIM = [232,219,223,41,219,236,220,190];
  const data = Buffer.from(CANCEL_DISCRIM);

  const keys = [
    { pubkey: ESCROW_PDA, isSigner: false, isWritable: true }, // escrow
    { pubkey: P1,         isSigner: false, isWritable: true }, // player1
    { pubkey: P2,         isSigner: false, isWritable: true }, // player2
    { pubkey: ESCROW_PDA, isSigner: false, isWritable: true }, // escrow_account
  ];

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data,
  });
}

/**
 * 4) Resolve/payout
 */
export async function buildResolveIxn(escrowId, winnerPubkey) {
  const ESCROW_PDA = new PublicKey(escrowId);
  const WINNER = new PublicKey(winnerPubkey);

  // hard‑code the 8 bytes for `resolve`
  const RESOLVE_DISCRIM = [246,150,236,206,108,63,58,10];
  const data = Buffer.concat([
    Buffer.from(RESOLVE_DISCRIM),
    Buffer.from(WINNER.toBytes()),
  ]);

  const program = getProgram();
  const HOUSE = program.provider.wallet.publicKey;

  const keys = [
    { pubkey: ESCROW_PDA, isSigner: false, isWritable: true }, // escrow
    { pubkey: WINNER,     isSigner: false, isWritable: true }, // winner
    { pubkey: HOUSE,      isSigner: false, isWritable: true }, // house
    { pubkey: ESCROW_PDA, isSigner: false, isWritable: true }, // escrow_account
  ];

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data,
  });
}
