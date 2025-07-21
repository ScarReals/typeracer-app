const { PublicKey } = require("@solana/web3.js");
const anchor = require("@coral-xyz/anchor");

// Use same program ID you deployed
const PROGRAM_ID = new PublicKey("EoxbV87Pub3gedymWbJpJ4eV67rGsPd7qcTFwGScbPEn");

// This must match the seeds used in your smart contract
function getEscrowVaultPda(escrowPda) {
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), escrowPda.toBuffer()],
    PROGRAM_ID
  );
  return vaultPda;
}

// Optional: if your smart contract derives escrowPDA using nonce + player1
function getEscrowPda(player1, nonce) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), player1.toBuffer(), Buffer.from(nonce.toString())],
    PROGRAM_ID
  );
  return pda;
}

module.exports = {
  getEscrowVaultPda,
  getEscrowPda,
};
