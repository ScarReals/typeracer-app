// show-house.js
const { Keypair } = require("@solana/web3.js");
const secret = Uint8Array.from([146,192,60,221,229,153,18,75,16,209,36,123,119,116,176,22,112,220,120,197,38,218,9,144,172,54,144,66,243,157,51,88,8,145,178,225,79,60,180,124,34,44,208,151,92,128,106,73,135,53,120,104,174,11,67,133,56,52,61,51,104,66,239,65]);
const kp = Keypair.fromSecretKey(secret);
console.log(kp.publicKey.toBase58());
