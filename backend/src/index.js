cat > backend/src/index.js <<'EOF'
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require("http");
const { Server } = require("socket.io");

const {
  Keypair,
  PublicKey,
  Connection,
  Transaction,
  TransactionInstruction,
} = require("@solana/web3.js");

// ─── CONFIG ────────────────────────────────────────────────
const RPC_URL = process.env.SOLANA_RPC_URL;
const HOUSE_KEYPAIR_PATH = process.env.HOUSE_KEYPAIR_PATH;
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID);
// 8-byte discriminator for `resolve` (must match your Rust)
const RESOLVE_DISCRIMINATOR = Buffer.from([246, 150, 236, 206, 108, 63, 58, 10]);
// ────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(bodyParser.json());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Simple health check for platforms like Render
app.get("/health", (_req, res) => res.json({ ok: true }));

// In-memory state
const openWagers = [];
const chats = {};
const liveProgress = {};
const startedMatches = new Set(); // prevents duplicate accepts/race starts

// ─── House Keypair ────────────────────────────────────────
const secret = Uint8Array.from(
  JSON.parse(fs.readFileSync(HOUSE_KEYPAIR_PATH, "utf-8"))
);
const HOUSE_KEYPAIR = Keypair.fromSecretKey(secret);

// ─── Solana Connection ─────────────────────────────────────
const connection = new Connection(RPC_URL, "confirmed");

// ─── REST + WebSocket Routes ──────────────────────────────
app.post("/wagers", (req, res) => {
  const { id, amount, creator, feePercent, vault, nonce } = req.body;
  if (!id || !vault || nonce === undefined) {
    return res.status(400).json({ error: "Missing match ID, vault PDA or nonce" });
  }
  openWagers.push({ id, amount, creator, feePercent, vault, nonce });
  io.emit("newMatch", { id, amount, creator, feePercent, nonce });
  res.json({ matchAccount: id });
});

app.get("/wagers", (_req, res) => {
  res.json(openWagers);
});

app.post("/wagers/:id/accept", (req, res) => {
  const { id } = req.params;
  const { accepter } = req.body;
  const idx = openWagers.findIndex(w => w.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });

  // Prevent self-accept
  if (openWagers[idx].creator === accepter) {
    return res.status(400).json({ error: "Creator cannot accept their own match" });
  }

  // Prevent multiple accepters
  if (openWagers[idx].accepter) {
    return res.status(409).json({ error: "Match already accepted" });
  }

  openWagers[idx].accepter = accepter;
  startedMatches.add(id);

  io.emit("removeMatch", id);
  io.to(id).emit("startMatch", {
    id,
    players: [openWagers[idx].creator, accepter],
  });
  res.json({ matchAccount: id });
});

app.post("/wagers/:id/cancel", (req, res) => {
  const { id } = req.params;
  const idx = openWagers.findIndex(w => w.id === id);
  if (idx !== -1) {
    openWagers.splice(idx, 1);
    io.emit("removeMatch", id);
  }
  startedMatches.delete(id);
  res.json({ success: true });
});

app.post("/wagers/:id/complete", (req, res) => {
  const { id } = req.params;
  io.to(id).emit("raceEnd", {
    winner: req.body.winner,
    progressMap: liveProgress[id] || {},
  });
  delete liveProgress[id];
  startedMatches.delete(id);
  res.json({ success: true });
});

io.on("connection", (socket) => {
  socket.emit("openMatches", openWagers);

  // Wallet-based guard for joinMatch (only creator & accepter)
  socket.on("joinMatch", (mid, wallet) => {
    const match = openWagers.find((w) => w.id === mid);
    if (!match) {
      socket.emit("joinError", { id: mid, message: "Match not found" });
      return;
    }

    const allowedWallets = [match.creator, match.accepter].filter(Boolean);
    if (!wallet || !allowedWallets.includes(wallet)) {
      socket.emit("joinError", { id: mid, message: "Match is full" });
      socket.leave(mid);
      return;
    }

    socket.join(mid);
    socket.emit("chat", chats[mid] || []);
  });

  socket.on("message", ({ matchId, sender, message }) => {
    if (!chats[matchId]) chats[matchId] = [];
    chats[matchId].push({ sender, message, time: new Date() });
    io.to(matchId).emit("chat", chats[matchId]);
  });

  // Only creator & accepter can send progress
  socket.on("progress", ({ matchId, wallet, progress }) => {
    const match = openWagers.find((w) => w.id === matchId);
    if (!match) return;

    const allowedWallets = [match.creator, match.accepter].filter(Boolean);
    if (!wallet || !allowedWallets.includes(wallet)) {
      socket.emit("joinError", { id: matchId, message: "You are not in this match" });
      return;
    }

    if (!liveProgress[matchId]) liveProgress[matchId] = {};
    liveProgress[matchId][wallet] = progress;
    socket.to(matchId).emit("opponentProgress", { wallet, progress });
  });
});

// ─── Resolve endpoint (house key only) ─────────────────────
app.post("/wagers/:id/resolve", async (req, res) => {
  try {
    const match = openWagers.find(w => w.id === req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });

    const escrowPda    = new PublicKey(match.id);
    const vaultPda     = new PublicKey(match.vault);
    const winnerPubkey = new PublicKey(req.body.winner);

    const data = Buffer.concat([
      RESOLVE_DISCRIMINATOR,
      Buffer.from(winnerPubkey.toBytes()),
    ]);

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: escrowPda,       isSigner: false, isWritable: true },
        { pubkey: winnerPubkey,    isSigner: false, isWritable: true },
        { pubkey: HOUSE_KEYPAIR.publicKey, isSigner: true,  isWritable: true },
        { pubkey: vaultPda,        isSigner: false, isWritable: true },
      ],
      data,
    });

    const tx = new Transaction().add(ix);
    tx.feePayer = HOUSE_KEYPAIR.publicKey;
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.sign(HOUSE_KEYPAIR);

    const sig = await connection.sendRawTransaction(
      tx.serialize(),
      { skipPreflight: false, preflightCommitment: "confirmed" }
    );
    await connection.confirmTransaction(sig, "confirmed");

    return res.json({ success: true, signature: sig });
  } catch (err) {
    console.error("Resolve failed:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Listen (Render needs 0.0.0.0 + provided PORT) ────────
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "0.0.0.0";
server.listen(PORT, HOST, () => {
  console.log(`🚀 Backend on http://${HOST}:${PORT}`);
});
EOF
