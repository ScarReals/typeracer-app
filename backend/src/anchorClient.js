// backend/src/anchorClient.js
const anchor = require("@coral-xyz/anchor");

// load your IDL
const idl = require("./idl/sol_wager.json");

// --- hack: if your IDL has no accounts section, make it an empty list ---
idl.accounts = idl.accounts || [];

// RPC & provider
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const provider = anchor.AnchorProvider.local(RPC_URL, { commitment: "confirmed" });
anchor.setProvider(provider);

// Program ID (hard‐coded)
const PROGRAM_ID = new anchor.web3.PublicKey(
  "EoxbV87Pub3gedymWbJpJ4eV67rGsPd7qcTFwGScbPEn"
);

// build the Program client
const program = new anchor.Program(idl, PROGRAM_ID, provider);

const { SystemProgram } = anchor.web3;
module.exports = { program, SystemProgram };
