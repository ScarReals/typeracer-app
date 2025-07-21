const { Connection, PublicKey } = require("@solana/web3.js");
const BufferLayout = require("buffer-layout");

const RPC_URL = "https://api.mainnet-beta.solana.com"; // or your cluster
const connection = new Connection(RPC_URL, "confirmed");

const ESCROW_LAYOUT = BufferLayout.struct([
  BufferLayout.blob(32, "player1"),
  BufferLayout.blob(32, "player2"),
  BufferLayout.blob(32, "authority"),
  BufferLayout.nu64("wager"),
  BufferLayout.nu64("total_amount"),
  BufferLayout.u8("p1_deposited"),
  BufferLayout.u8("p2_deposited"),
  BufferLayout.u8("is_active"),
  BufferLayout.nu64("nonce"),
]);

(async () => {
  const addr = new PublicKey("4L7zyjif1mihukaRnWWNMS1ra46vmjePUsyfvaAidfcj");
  const accInfo = await connection.getAccountInfo(addr);

  if (!accInfo) {
    console.error("Account not found");
    return;
  }

  const decoded = ESCROW_LAYOUT.decode(accInfo.data);
  decoded.player1 = new PublicKey(decoded.player1).toBase58();
  decoded.player2 = new PublicKey(decoded.player2).toBase58();
  decoded.authority = new PublicKey(decoded.authority).toBase58();

  console.log("Decoded Escrow account:");
  console.log(decoded);
})();
