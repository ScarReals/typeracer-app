// frontend/src/solana.js

import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import idl from "./idl/typeracer_escrow.json";

// ── Program ID from your IDL ────────────────────────────────────────────────
const PROGRAM_ID = new PublicKey(
  // Anchor puts it either top‑level or in metadata.address
  idl.address || (idl.metadata && idl.metadata.address)
);

// ── setProvider: call in your App.jsx after wallet connects ─────────────────
export function setProvider(wallet) {
  if (!wallet?.publicKey) throw new Error("Wallet not connected");
  const network = process.env.REACT_APP_SOLANA_NETWORK || "mainnet-beta";
  const rpc = process.env.REACT_APP_SOLANA_RPC || clusterApiUrl(network);
  const connection = new Connection(rpc, "confirmed");
  const provider = new anchor.AnchorProvider(connection, wallet, {
    preflightCommitment: "confirmed",
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
}

// ── getProvider: for escrow.js to grab the AnchorProvider you set ───────────
export function getProvider() {
  const provider = anchor.getProvider();
  if (!provider) throw new Error("Provider not set. Call setProvider(wallet) first.");
  return provider;
}

export { PROGRAM_ID };
