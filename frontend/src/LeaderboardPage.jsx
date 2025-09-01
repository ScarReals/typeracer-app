import React from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import Leaderboard from "./Leaderboard";
import "./App.css";

export default function LeaderboardPage() {
  const { connected, publicKey, disconnect } = useWallet();
  const API = process.env.REACT_APP_API_URL;
  const addr = publicKey?.toBase58() || "";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="dot" />
          <div className="brand-text">
            <div className="brand-title">TypeRacer</div>
            <div className="brand-sub">Race to win SOL</div>
          </div>
        </div>

        {/* X logo link */}
        <a
          href="https://x.com/TypeRacerSol"
          target="_blank"
          rel="noopener noreferrer"
          className="x-link"
          title="Follow us on X"
        >
          <img src="/x-logo.png" alt="X" className="x-icon" />
        </a>

        {connected ? (
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div className="wallet-pill">
              {addr.slice(0, 6)}…{/* balance optional on this page */}
            </div>
            <button className="btn outline" onClick={() => disconnect()} title="Disconnect wallet">
              Disconnect
            </button>
          </div>
        ) : (
          <WalletMultiButton className="connect-btn" />
        )}
      </header>

      <main>
        <h1 className="hero-title">Leaderboard</h1>
        <p className="hero-subtitle">Fastest racers and most wins</p>
        <Leaderboard API={API} />
      </main>
    </div>
  );
}
