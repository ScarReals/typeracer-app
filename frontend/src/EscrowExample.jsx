// src/EscrowExample.jsx
import React, { useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { getAnchorProgram } from "./solana";

const HOUSE_WALLET = new PublicKey("A32Burni3cYyFAqjZM3CvCrStAKRFCfftk196Xfpx9Hs");

export default function EscrowExample() {
  const { publicKey, wallet, connected } = useWallet();
  const [status, setStatus] = useState("");
  if (!connected) return <button disabled>Connect Wallet</button>;

  const program = getAnchorProgram(wallet);

  // Derive the PDA for this escrow
  const findPda = async (wagerLamports) => {
    return await PublicKey.findProgramAddress(
      [
        Buffer.from("escrow"),
        publicKey.toBuffer(),
      ],
      program.programId
    );
  };

  // 1) Initialize (create) escrow
  const createMatch = async (sol) => {
    setStatus("Creating…");
    const lamports = sol * anchor.web3.LAMPORTS_PER_SOL;
    const [escrowPda, bump] = await findPda(lamports);

    await program.methods
      .initialize(new anchor.BN(lamports), bump)
      .accounts({
        escrow: escrowPda,
        player1: publicKey,
        authority: publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    setStatus(`Escrow created at ${escrowPda.toBase58()}`);
  };

  // 2) Accept (join) escrow
  const acceptMatch = async (sol, escrowPda) => {
    setStatus("Accepting…");
    const lamports = sol * anchor.web3.LAMPORTS_PER_SOL;
    await program.methods
      .join()
      .accounts({
        escrow: new PublicKey(escrowPda),
        player2: publicKey,
      })
      .rpc();
    setStatus("Joined!");
  };

  // 3) Deposit into escrow
  const deposit = async (sol, escrowPda) => {
    setStatus("Depositing…");
    const lamports = sol * anchor.web3.LAMPORTS_PER_SOL;
    await program.methods
      .deposit()
      .accounts({
        escrow: new PublicKey(escrowPda),
        payer: publicKey,
        escrowAccount: new PublicKey(escrowPda),
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    setStatus("Deposited!");
  };

  // 4) Resolve (finish)
  const resolve = async (escrowPda, winnerPubkey) => {
    setStatus("Resolving…");
    await program.methods
      .resolve(new PublicKey(winnerPubkey))
      .accounts({
        escrow: new PublicKey(escrowPda),
        winner: new PublicKey(winnerPubkey),
        house: HOUSE_WALLET,
        escrowAccount: new PublicKey(escrowPda),
        authority: publicKey,
      })
      .rpc();
    setStatus("Resolved!");
  };

  // 5) Cancel
  const cancel = async (escrowPda) => {
    setStatus("Cancelling…");
    await program.methods
      .cancel()
      .accounts({
        escrow: new PublicKey(escrowPda),
        player1: publicKey,
        player2: publicKey, // or fetch real
        escrowAccount: new PublicKey(escrowPda),
        authority: publicKey,
      })
      .rpc();
    setStatus("Cancelled!");
  };

  return (
    <div>
      <h2>Escrow Demo</h2>
      <button onClick={() => createMatch(1)}>Create 1 SOL Match</button>
      <button onClick={() => acceptMatch(1, prompt("PDA:"))}>
        Accept Match
      </button>
      <button onClick={() => deposit(1, prompt("PDA:"))}>
        Deposit
      </button>
      <button
        onClick={() =>
          resolve(prompt("PDA:"), prompt("Winner pubkey (you or opponent):"))
        }
      >
        Resolve
      </button>
      <button onClick={() => cancel(prompt("PDA:"))}>Cancel</button>
      <p>{status}</p>
    </div>
  );
}
