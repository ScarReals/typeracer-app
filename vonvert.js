const bs58 = require('bs58');
const fs = require('fs');

// Replace the string below with your base58 PRIVATE KEY exactly as shown (no line breaks)
const base58key = '4BZjohtRsnstL6PUizUJnhPtWaQV7xYCLmcMqgvRvHZccqQBKGBsTg3bB3kQgjjCbihF5nHyeGcd6PGMp9Y2uZjf';

const bytes = bs58.decode(base58key);

console.log("Decoded length:", bytes.length); // Should be 64

// Write to a file that can be used as your Solana keypair
fs.writeFileSync('house-keypair.json', JSON.stringify(Array.from(bytes)));
console.log("Wrote to house-keypair.json");
