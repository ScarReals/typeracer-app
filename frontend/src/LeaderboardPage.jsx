// src/LeaderboardPage.jsx
import React, { useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import "./App.css";

export default function LeaderboardPage() {
  const { connected, publicKey, disconnect } = useWallet();
  const API = process.env.REACT_APP_API_URL;
  const addr = publicKey?.toBase58() || "";

  const [data, setData] = useState({ fastest: [], mostWins: [], totalRuns: 0 });
  const [loading, setLoading] = useState(true);

  async function fetchBoard() {
    try {
      const res = await fetch(`${API}/leaderboard?limit=100`);
      const j = await res.json();
      setData(j);
    } catch (_) {}
    setLoading(false);
  }

  useEffect(() => {
    fetchBoard();
    const iv = setInterval(fetchBoard, 10000);
    return () => clearInterval(iv);
  }, []);

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

        <a href="/" className="btn outline" style={{ marginRight: 8 }}>
          ← Back Home
        </a>

        {connected ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="wallet-pill">{addr.slice(0, 6)}…</div>
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
        <p className="hero-subtitle">Top 100 fastest runs (WPM) and most wins</p>

        {loading ? (
          <div className="empty-tile">Loading…</div>
        ) : (
          <div className="lb-grid">
            <section className="card">
              <h2 style={{ marginTop: 0 }}>Fastest WPM</h2>
              {data.fastest.length === 0 ? (
                <div className="empty-tile">No runs yet</div>
              ) : (
                <table className="lb-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Wallet</th>
                      <th>WPM</th>
                      <th>Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.fastest.map((e, i) => (
                      <tr key={e.wallet + i}>
                        <td>{i + 1}</td>
                        <td>{e.wallet.slice(0, 6)}…{e.wallet.slice(-3)}</td>
                        <td>{Number(e.wpm).toFixed(1)}</td>
                        <td>{Math.round(Number(e.accuracy))}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="card">
              <h2 style={{ marginTop: 0 }}>Most Wins</h2>
              {data.mostWins.length === 0 ? (
                <div className="empty-tile">No wins yet</div>
              ) : (
                <table className="lb-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Wallet</th>
                      <th>Wins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.mostWins.map((e, i) => (
                      <tr key={e.wallet + i}>
                        <td>{i + 1}</td>
                        <td>{e.wallet.slice(0, 6)}…{e.wallet.slice(-3)}</td>
                        <td>{e.wins}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}

        <p className="brand-sub" style={{ marginTop: 12 }}>
          Total recorded runs: {data.totalRuns}
        </p>
      </main>
    </div>
  );
}
