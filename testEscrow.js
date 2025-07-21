require("dotenv").config();
const anchor = require("@coral-xyz/anchor");
const idl = require("./frontend/src/idl/typeracer_escrow.json");
const { Keypair, PublicKey, SystemProgram } = require("@solana/web3.js");
const assert = require("assert");

// Load RPC URL and Program ID from env (put these in a .env file or export them)
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = process.env.REACT_APP_ESCROW_PROGRAM_ID;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  // 1) Set up Anchor provider
  const connection = new anchor.web3.Connection(RPC_URL, "confirmed");
  const wallet1 = Keypair.generate();
  const wallet2 = Keypair.generate();
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet1), {});
  anchor.setProvider(provider);

  // 2) Instantiate the Program client
  const program = new anchor.Program(idl, PROGRAM_ID, provider);

  console.log("Airdropping 2 SOL to both test wallets…");
  await connection.requestAirdrop(wallet1.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
  await connection.requestAirdrop(wallet2.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
  await sleep(5000);

  // 3) Initialize escrow by player1
  const wagerLamports = Math.floor(0.5 * anchor.web3.LAMPORTS_PER_SOL);
  const nonce = new anchor.BN(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER), 10, "le");
  const [escrowPda] = await PublicKey.findProgramAddress(
    [Buffer.from("escrow"), wallet1.publicKey.toBuffer(), nonce.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  console.log("Initializing escrow PDA:", escrowPda.toBase58());
  await program.methods
    .initialize(new anchor.BN(wagerLamports), nonce)
    .accounts({
      escrow: escrowPda,
      player1: wallet1.publicKey,
      authority: wallet1.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([wallet1])
    .rpc();

  // 4) Player1 deposit
  console.log("Player1 depositing…");
  await program.methods
    .deposit()
    .accounts({
      escrow: escrowPda,
      payer: wallet1.publicKey,
      escrowAccount: escrowPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([wallet1])
    .rpc();

  // 5) Player2 join & deposit
  console.log("Player2 joining…");
  await program.methods
    .join()
    .accounts({
      escrow: escrowPda,
      player2: wallet2.publicKey,
    })
    .signers([wallet2])
    .rpc();

  console.log("Player2 depositing…");
  await program.methods
    .deposit()
    .accounts({
      escrow: escrowPda,
      payer: wallet2.publicKey,
      escrowAccount: escrowPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([wallet2])
    .rpc();

  // 6) Resolve by player1
  console.log("Resolving, paying out player1…");
  const before = await connection.getBalance(wallet1.publicKey);
  await program.methods
    .resolve(wallet1.publicKey)
    .accounts({
      escrow: escrowPda,
      winner: wallet1.publicKey,
      house: wallet1.publicKey,          // use player1 as house for test
      escrowAccount: escrowPda,
      authority: wallet1.publicKey,
    })
    .signers([wallet1])
    .rpc();

  const after = await connection.getBalance(wallet1.publicKey);
  console.log("Balance before:", before / anchor.web3.LAMPORTS_PER_SOL);
  console.log("Balance after: ", after / anchor.web3.LAMPORTS_PER_SOL);
  assert(after > before, "Winner did not receive payout");

  console.log("✅ End-to-end escrow test passed!");
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
