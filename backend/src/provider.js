const anchor = require("@coral-xyz/anchor");
const { Connection } = require("@solana/web3.js");

function getProvider(wallet, rpcUrl) {
  const connection = new Connection(rpcUrl, "confirmed");
  return new anchor.AnchorProvider(connection, wallet, {
    preflightCommitment: "confirmed",
    commitment: "confirmed",
  });
}

module.exports = getProvider;
