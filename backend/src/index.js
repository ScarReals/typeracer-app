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

// Frontend origin allow-list for CORS (add more comma-separated if needed)
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
// ────────────────────────────────────────────────────────────

const app = express();

// Trust reverse proxy headers (Render/other PaaS)
app.set("trust proxy", 1);

// CORS: allow your Vercel site (and any extra origins set via env)
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin / non-browser requests
      if (!origin) return cb(null, true);
      if (FRONTEND_ORIGINS.length === 0) return cb(null, true); // fallback: allow all if not configured
      if (FRONTEND_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
  })
);

app.use(bodyParser.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (FRONTEND_ORIGINS.length === 0) return cb(null, true);
      if (FRONTEND_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
  },
});

// In-memory state
const openWagers = [];
const chats = {};
const liveProgress = {};
const leaderboard = []; // { wallet, wpm, accuracy, amount, matchId, ts }

// ─── House Keypair ────────────────────────────────────────
const secret = Uint8Array.from(
  JSON.parse(fs.readFileSync(HOUSE_KEYPAIR_PATH, "utf-8"))
);
const HOUSE_KEYPAIR = Keypair.fromSecretKey(secret);
// ────────────────────────────────────────────────────────────

// ─── Solana Connection ─────────────────────────────────────
const connection = new Connection(RPC_URL, "confirmed");
// ────────────────────────────────────────────────────────────

// ─── Health check (for Render) ─────────────────────────────
app.get("/healthz", (_req, res) => res.json({ ok: true }));
// ────────────────────────────────────────────────────────────

// ─── REST + WebSocket Routes ──────────────────────────────
app.post("/wagers", (req, res) => {
  const { id, amount, creator, feePercent, vault, nonce } = req.body;
  if (!id || !vault || nonce === undefined) {
    return res
      .status(400)
      .json({ error: "Missing match ID, vault PDA or nonce" });
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
  const idx = openWagers.findIndex((w) => w.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });

  // prevent double-join race: if already accepted, 409
  if (openWagers[idx].accepter) {
    return res.status(409).json({ error: "Already accepted" });
  }

  openWagers[idx].accepter = accepter;
  io.emit("removeMatch", id);
  io.to(id).emit("startMatch", {
    id,
    players: [openWagers[idx].creator, accepter],
  });
  res.json({ matchAccount: id });
});

app.post("/wagers/:id/cancel", (req, res) => {
  const { id } = req.params;
  const idx = openWagers.findIndex((w) => w.id === id);
  if (idx !== -1) {
    openWagers.splice(idx, 1);
    io.emit("removeMatch", id);
  }
  res.json({ success: true });
});

app.post("/wagers/:id/complete", (req, res) => {
  const { id } = req.params;
  const match = openWagers.find((w) => w.id === id) || null;

  // Broadcast race end to room
  io.to(id).emit("raceEnd", {
    winner: req.body.winner,
    progressMap: liveProgress[id] || {},
  });

  // Record leaderboard entry (best-effort; non-blocking)
  try {
    const wallet = String(req.body.winner || "");
    const wpm = Number(req.body.wpm || 0);
    const accuracy = Number(req.body.accuracy || 0);
    if (wallet) {
      leaderboard.push({
        wallet,
        wpm: Number.isFinite(wpm) ? wpm : 0,
        accuracy: Number.isFinite(accuracy) ? accuracy : 0,
        amount: match?.amount ?? 0,
        matchId: id,
        ts: Date.now(),
      });
    }
  } catch (e) {
    console.warn("leaderboard push failed:", e.message);
  }

  // Cleanup progress
  delete liveProgress[id];
  res.json({ success: true });
});

// ─── Leaderboard API ───────────────────────────────────────
// Returns top fastest by WPM and top players by #wins
app.get("/leaderboard", (req, res) => {
  // ensure no caching so your page always shows latest
  res.set("Cache-Control", "no-store");

  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));

  // fastest runs (dedupe by wallet keeping their best)
  const bestByWallet = new Map();
  for (const e of leaderboard) {
    const cur = bestByWallet.get(e.wallet);
    if (!cur || e.wpm > cur.wpm) bestByWallet.set(e.wallet, e);
  }
  const fastest = Array.from(bestByWallet.values())
    .sort((a, b) => b.wpm - a.wpm)
    .slice(0, limit);

  // most wins
  const winCounts = new Map();
  for (const e of leaderboard) {
    winCounts.set(e.wallet, (winCounts.get(e.wallet) || 0) + 1);
  }
  const mostWins = Array.from(winCounts.entries())
    .map(([wallet, wins]) => ({ wallet, wins }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, limit);

  res.json({ fastest, mostWins, totalRuns: leaderboard.length });
});

// ─── WebSocket ─────────────────────────────────────────────
io.on("connection", (socket) => {
  // send current open matches to new client
  socket.emit("openMatches", openWagers);

  socket.on("joinMatch", (mid) => {
    socket.join(mid);
    socket.emit("chat", chats[mid] || []);
  });

  socket.on("message", ({ matchId, sender, message }) => {
    if (!chats[matchId]) chats[matchId] = [];
    chats[matchId].push({ sender, message, time: new Date() });
    io.to(matchId).emit("chat", chats[matchId]);
  });

  socket.on("progress", ({ matchId, wallet, progress }) => {
    if (!liveProgress[matchId]) liveProgress[matchId] = {};
    liveProgress[matchId][wallet] = progress;
    socket.to(matchId).emit("opponentProgress", { wallet, progress });
  });
});
// ────────────────────────────────────────────────────────────

// ─── Resolve endpoint (house key only) ─────────────────────
// NOTE: Keys/order must match your on-chain IDL. This version does NOT add system_program,
// keeping behavior identical to your original (no auto-close on-chain unless your program handles it).
app.post("/wagers/:id/resolve", async (req, res) => {
  try {
    const match = openWagers.find((w) => w.id === req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });

    const escrowPda = new PublicKey(match.id);
    const vaultPda = new PublicKey(match.vault);
    const winnerPubkey = new PublicKey(req.body.winner);

    // Build the instruction data: discriminator + winner pubkey
    const data = Buffer.concat([
      RESOLVE_DISCRIMINATOR,
      Buffer.from(winnerPubkey.toBytes()),
    ]);

    // ⚠️ Keys must exactly match your IDL (no system_program here)
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: escrowPda, isSigner: false, isWritable: true }, // escrow
        { pubkey: winnerPubkey, isSigner: false, isWritable: true }, // winner
        { pubkey: HOUSE_KEYPAIR.publicKey, isSigner: true, isWritable: true }, // house
        { pubkey: vaultPda, isSigner: false, isWritable: true }, // escrow_account/vault
      ],
      data,
    });

    // Sign & send
    const tx = new Transaction().add(ix);
    tx.feePayer = HOUSE_KEYPAIR.publicKey;
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.sign(HOUSE_KEYPAIR);

    const sig = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await connection.confirmTransaction(sig, "confirmed");

    return res.json({ success: true, signature: sig });
  } catch (err) {
    console.error("Resolve failed:", err);
    return res.status(500).json({ error: err.message });
  }
});
// ────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Backend on http://localhost:${PORT}`);
});
