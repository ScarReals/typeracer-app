import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import sentences from "./sentences";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL, Transaction } from "@solana/web3.js";
import socket from "./socket";
import * as anchor from "@coral-xyz/anchor";
import { setProvider } from "./solana";
import {
  buildInitializeAndDepositIxns,
  buildJoinAndDepositIxn,
  buildCancelIxn,
  buildResolveIxn,
} from "./escrow";

/* ──────────────────────────────────────────
   SVG Cars
   ────────────────────────────────────────── */
function CarPlayerSVG() {
  return (
    <svg viewBox="0 0 120 50" className="car-svg player">
      <defs>
        <linearGradient id="plyrBody" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
        <filter id="plyrGlow" x="-40%" y="-120%" width="180%" height="300%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#7c3aed" floodOpacity="0.65"/>
        </filter>
      </defs>
      <g filter="url(#plyrGlow)">
        <rect x="10" y="18" width="80" height="14" rx="7" fill="url(#plyrBody)" />
        <path d="M20 18 L40 10 H70 L90 18 Z" fill="url(#plyrBody)" />
        <rect x="45" y="12" width="18" height="8" rx="2" fill="#0f172a" opacity="0.8" />
        <circle cx="30" cy="36" r="8" fill="#0b1020" stroke="#c7d2fe" strokeWidth="2"/>
        <circle cx="80" cy="36" r="8" fill="#0b1020" stroke="#c7d2fe" strokeWidth="2"/>
      </g>
    </svg>
  );
}
function CarOpponentSVG() {
  return (
    <svg viewBox="0 0 120 50" className="car-svg foe">
      <defs>
        <linearGradient id="foeBody" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#fb7185" />
        </linearGradient>
        <filter id="foeGlow" x="-40%" y="-120%" width="180%" height="300%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#ef4444" floodOpacity="0.65"/>
        </filter>
      </defs>
      <g filter="url(#foeGlow)">
        <rect x="10" y="18" width="80" height="14" rx="7" fill="url(#foeBody)" />
        <path d="M20 18 L40 10 H70 L90 18 Z" fill="url(#foeBody)" />
        <rect x="45" y="12" width="18" height="8" rx="2" fill="#0f172a" opacity="0.8" />
        <circle cx="30" cy="36" r="8" fill="#0b1020" stroke="#fecaca" strokeWidth="2"/>
        <circle cx="80" cy="36" r="8" fill="#0b1020" stroke="#fecaca" strokeWidth="2"/>
      </g>
    </svg>
  );
}

/* ──────────────────────────────────────────
   Join Match – pretty tiles + big CTA
   ────────────────────────────────────────── */
function JoinMatchCard({ openMatches, isAccepting, acceptMatch }) {
  return (
    <div className="card join-card nice">
      <div className="card-icon">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c-2.67 0-8 1.34-8 4v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1c0-2.66-5.33-4-8-4Zm-8 1c-2.42 0-7 1.21-7 3.6V19a1 1 0 0 0 1 1h6"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </div>
      <h2 className="join-title">Join Match</h2>
      <p className="join-sub">Browse open matches and join instantly.</p>

      <div className="match-scroll">
        {openMatches.length === 0 && (
          <div className="empty-tile">No open matches available</div>
        )}
        {openMatches.map((m, idx) => {
          const players = m.accepter ? 2 : 1; // 1/2 until accepter exists
          const isFull = players >= 2;
          return (
            <div className="match-tile" key={m.id}>
              <div className="tile-header">
                <div className="tile-left">
                  <div className="tile-title">Match #{idx + 1}</div>
                  <div className="tile-id">{m.id.slice(0, 6)}…{m.id.slice(-3)}</div>
                </div>
                <div className="tile-right">
                  <div className="tile-amount">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M8 12h8M12 7v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                    <span>{m.amount} <b>SOL</b></span>
                  </div>
                  <div className="tile-players">{players}/2 players</div>
                </div>
              </div>

              {!isFull ? (
                <button
                  onClick={() => acceptMatch(m)}
                  disabled={isAccepting}
                  className="big-cta"
                >
                  {isAccepting ? "Joining…" : "Join Match"}
                </button>
              ) : (
                <button className="big-cta" disabled>Match Full</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────
   FAQ – mini accordion
   ────────────────────────────────────────── */
function FAQ() {
  const [open, setOpen] = useState(null);
  const items = [
    { q: "What is TypeRacer?", a: "A realtime typing game on Solana. Create or join a match, race, and the winner takes the pot." },
    { q: "How are payouts handled?", a: "After both deposits, the program escrows funds and pays the winner (minus fee) on resolve." },
    { q: "Can I choose any wager?", a: "Yes. Use presets or type a custom amount (min 0.01 SOL)." },
  ];
  return (
    <section className="faq-section">
      <h2>FAQ</h2>
      <div className="faq-list">
        {items.map((it, i) => (
          <div key={i} className={`faq-item ${open === i ? "open" : ""}`} onClick={() => setOpen(open === i ? null : i)}>
            <div className="faq-q">{it.q}</div>
            {open === i && <div className="faq-a">{it.a}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────
   App
   ────────────────────────────────────────── */
export default function App() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;
  const walletAddress = publicKey?.toBase58() || "";

  const walletAddressRef = useRef(walletAddress);
  useEffect(() => { walletAddressRef.current = walletAddress; }, [walletAddress]);

  useEffect(() => {
    if (connected && connection) {
      const prov = new anchor.AnchorProvider(connection, wallet, {
        preflightCommitment: "confirmed",
        commitment: "confirmed",
      });
      anchor.setProvider(prov);
      setProvider(wallet);
    }
  }, [connected, connection, wallet]);

  const [walletBalance, setWalletBalance] = useState(0);
  useEffect(() => {
    if (connection && publicKey) {
      connection.getBalance(publicKey).then((lamports) => {
        setWalletBalance(lamports / LAMPORTS_PER_SOL);
      });
    }
  }, [connection, publicKey]);

  // app state
  const [wager, setWager] = useState("");
  const [openMatches, setOpenMatches] = useState([]);
  const [currentMatch, setCurrentMatch] = useState(null);
  const [matchStatus, setMatchStatus] = useState("waiting");

  // waiting/cancel timer
  const [matchCreatedAt, setMatchCreatedAt] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);

  // race state
  const [sentence, setSentence] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [playerProgress, setPlayerProgress] = useState(0);
  const [opponentProgress, setOpponentProgress] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [raceResult, setRaceResult] = useState(null);
  const [isInputDisabled, setIsInputDisabled] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [opponentWallet, setOpponentWallet] = useState(null);

  const [hasError, setHasError] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const inputRef = useRef(null);

  const API = process.env.REACT_APP_API_URL;

  const [lastProgTime, setLastProgTime] = useState(Date.now());
  const [lastProg, setLastProg] = useState(0);
  const MAX_CPS = 50; // ⬅️ increased anti-cheat ceiling

  const chooseSentence = (id) =>
    sentences[Array.from(id).reduce((a, c) => a + c.charCodeAt(0), 0) % sentences.length];

  const fetchOpenMatches = async () => {
    try {
      const res = await fetch(`${API}/wagers`);
      const wm = await res.json();
      setOpenMatches(wm.filter((m) => !m.accepter)); // only 1/2 matches
    } catch {}
  };

  useEffect(() => {
    socket.connect();
    socket.on("openMatches", (wm) => setOpenMatches(wm.filter((m) => !m.accepter)));
    socket.on("newMatch", (m) => setOpenMatches((os) => [...os, m].filter((x) => !x.accepter)));
    socket.on("removeMatch", (id) => setOpenMatches((os) => os.filter((m) => m.id !== id)));
    fetchOpenMatches();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

  // cancel window (90s)
  useEffect(() => {
    if (!matchCreatedAt) return;
    const tick = () => {
      const elapsed = Date.now() - matchCreatedAt;
      const secs = Math.ceil((90_000 - elapsed) / 1000);
      setTimeLeft(secs > 0 ? secs : 0);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [matchCreatedAt]);

  // race lifecycle (with robust player normalization)
  useEffect(() => {
    const onStart = ({ id, players }) => {
      socket.emit("joinMatch", id, walletAddressRef.current);

      // normalize players to ensure creator+accepter are present & ordered deterministically
      const uniq = Array.from(new Set((players || []).filter(Boolean)));
      const me = walletAddressRef.current;

      setCurrentMatch((prev) => {
        const fallbackCreator = prev?.creator || me;
        // choose creator from socket or fallback (creator is simply the first non-null)
        const creator =
          uniq[0] ||
          fallbackCreator;

        // accepter is the other distinct wallet if present
        const accepter =
          uniq.find((p) => p !== creator) ||
          prev?.accepter ||
          null;

        const other = [creator, accepter].find((w) => w && w !== me) || null;
        setOpponentWallet(other);

        setPlayerProgress(0);
        setOpponentProgress(0);

        return {
          id,
          amount: prev?.amount ?? 0,
          creator,
          accepter,
          nonce: prev?.nonce,
        };
      });

      setSentence(chooseSentence(id));
      setMatchStatus("ready");
      setCountdown(3);
      setHasError(false);
    };

    const onOppProg = ({ wallet: w, progress }) => {
      if (w !== walletAddressRef.current) setOpponentProgress(progress);
    };

    const onRaceEnd = ({ winner, progressMap }) => {
      setMatchStatus("finished");
      setIsInputDisabled(true);
      setRaceResult({ result: winner === walletAddressRef.current ? "win" : "lose" });
      if (progressMap) {
        setPlayerProgress(progressMap[walletAddressRef.current] ?? 0);
        setOpponentProgress(progressMap[opponentWallet ?? ""] ?? 0);
      }
    };

   const onJoinError = (err) => {
     alert(err.message || "Unable to join match");
     resetGame(); // sends them back to home screen
   };


    socket.on("startMatch", onStart);
    socket.on("opponentProgress", onOppProg);
    socket.on("raceEnd", onRaceEnd);
    socket.on("chat", setChatMessages);
    socket.on("opponentLeft", resetGame);
    socket.on("joinError", onJoinError);
    return () => {
      socket.off("startMatch", onStart);
      socket.off("opponentProgress", onOppProg);
      socket.off("raceEnd", onRaceEnd);
      socket.off("chat", setChatMessages);
      socket.off("opponentLeft", resetGame);
      socket.off("joinError", onJoinError);
    };
  }, [opponentWallet]);

  // ensure accepter sees a sentence
  useEffect(() => {
    if (currentMatch && (matchStatus === "ready" || matchStatus === "racing")) {
      if (!sentence && currentMatch.id) setSentence(chooseSentence(currentMatch.id));
      if (matchStatus === "racing") setIsInputDisabled(false);
    }
  }, [currentMatch, matchStatus, sentence]);

  useEffect(() => {
    if (matchStatus === "ready" && countdown > 0) {
      const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    } else if (matchStatus === "ready" && countdown === 0) {
      setMatchStatus("racing");
      setIsInputDisabled(false);
      inputRef.current?.focus();
    }
  }, [countdown, matchStatus]);

  async function createMatch() {
    if (!connected) return alert("Connect wallet");
    const min = 0.01;
    const amt = Number(wager);
    if (!amt || isNaN(amt) || amt < min) {
      return alert(`Minimum wager is ${min} SOL`);
    }
    try {
      const lamports = Math.floor(amt * LAMPORTS_PER_SOL);
      const nonce = Math.floor(Math.random() * 1_000_000);
      const { ixInit, ixDeposit, escrowPda } =
        await buildInitializeAndDepositIxns(lamports, publicKey, nonce);

      const tx = new Transaction().add(ixInit, ixDeposit);
      await wallet.sendTransaction(tx, connection);

      const id = escrowPda.toBase58();
      await fetch(`${API}/wagers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          vault: id,
          amount: Number(amt),
          creator: walletAddressRef.current,
          feePercent: 5,
          nonce,
        }),
      });

      setCurrentMatch({
        id,
        amount: Number(amt),
        creator: walletAddressRef.current,
        nonce,
      });
      setMatchCreatedAt(Date.now());
      setMatchStatus("waiting");
      socket.emit("joinMatch", id, walletAddressRef.current); // ensure creator is in the room
      fetchOpenMatches();
    } catch (e) {
      console.error("Create error:", e);
      alert("Create match failed:\n" + e.message);
    }
  }

  async function acceptMatch(m) {
    if (!connected) return alert("Connect wallet");
    setIsAccepting(true);
    try {
      const ix = await buildJoinAndDepositIxn(m.id);
      await wallet.sendTransaction(new Transaction().add(ix), connection);

      await fetch(`${API}/wagers/${m.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepter: walletAddressRef.current }),
      });

      setCurrentMatch({ ...m, accepter: walletAddressRef.current });
      setSentence(chooseSentence(m.id));
      setMatchStatus("ready");
      setCountdown(3);
      socket.emit("joinMatch", m.id, walletAddressRef.current);
      setHasError(false);
    } catch (e) {
      console.error("Accept error:", e);
      alert("Accept error:\n" + e.message);
      setCurrentMatch(null);
    } finally {
      setIsAccepting(false);
    }
  }

  async function cancelMatch(m) {
    try {
      const ix = await buildCancelIxn(m.id, m.creator, m.accepter || m.creator);
      await wallet.sendTransaction(new Transaction().add(ix), connection);
      await fetch(`${API}/wagers/${m.id}/cancel`, { method: "POST" });
      resetGame();
    } catch (e) {
      console.error("Cancel error:", e);
      alert("Cancel error:\n" + e.message);
    }
  }

  function resetGame() {
    setCurrentMatch(null);
    setMatchStatus("waiting");
    setSentence("");
    setInputValue("");
    setPlayerProgress(0);
    setOpponentProgress(0);
    setCountdown(3);
    setRaceResult(null);
    setIsInputDisabled(false);
    setOpponentWallet(null);
    setLastProg(0);
    setLastProgTime(Date.now());
    setMatchCreatedAt(0);
    setTimeLeft(0);
    setHasError(false);
    fetchOpenMatches();
  }

  // ⬇️ Block Select-All inside the typing input
  function preventSelectAll(e) {
    if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === "a") {
      e.preventDefault();
    }
  }

  function handleInput(e) {
    if (isInputDisabled) return;
    if (e.type === "paste") { e.preventDefault(); return; }
    const val = e.target.value;

    if (!sentence.startsWith(val)) {
      setHasError(true);
      setInputValue(val);
      return;
    }
    setHasError(false);

    const now = Date.now();
    const raw = Math.min(1, val.length / sentence.length);
    const delta = raw - lastProg;
    const dt = (now - lastProgTime) / 1000;
    const cps = dt > 0 ? (delta * sentence.length) / dt : 0;
    if (cps > MAX_CPS) return;

    setLastProg(raw);
    setLastProgTime(now);
    setInputValue(val);
    setPlayerProgress(raw);

    if (currentMatch?.id) {
      socket.emit("progress", {
        matchId: currentMatch.id,
        wallet: walletAddressRef.current,
        progress: raw,
      });
    }

    if (val === sentence && currentMatch?.id) {
      fetch(`${API}/wagers/${currentMatch.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner: walletAddressRef.current }),
      });
      setMatchStatus("finished");
      setIsInputDisabled(true);
      setRaceResult({ result: "win" });
    }
  }

  function renderHighlightedSentence(str, typed, error) {
    const out = [];
    const len = str.length;
    for (let i = 0; i < len; i++) {
      const ch = str[i];
      const typedCh = typed[i];
      if (i < typed.length) {
        out.push(<span key={i} className={typedCh === ch ? "text-correct" : "text-error"}>{ch}</span>);
      } else if (i === typed.length && !error) {
        out.push(<span key={i} className="text-next">{ch}</span>);
      } else {
        out.push(<span key={i} className="text-remaining">{ch}</span>);
      }
    }
    return out;
  }

  const renderHome = () => (
    <div className="homepage">
      <h1 className="hero-title">TypeRacer</h1>
      <p className="hero-subtitle">Race against others in real time. Place your bet and win SOL.</p>

      <div className="home-grid">
        {/* Create Match */}
        <div className="card create-card nice">
          <div className="card-icon">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="create-title">Create Match</h2>
          <p className="create-sub">Pick a wager and open a new race.</p>

          <div className="preset-buttons">
            {[0.1, 0.5, 1].map((amt) => (
              <button key={amt} onClick={() => setWager(amt)} className={Number(wager) === amt ? "active" : ""}>
                {amt} SOL
              </button>
            ))}
          </div>

          <input
            type="number" step="0.01" min="0.01"
            placeholder="Custom amount (min 0.01)"
            value={wager}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isNaN(n)) return setWager("");
              setWager(Math.max(0.01, n));
            }}
          />

          <button className="big-cta" onClick={createMatch}>Create Match</button>
        </div>

        {/* Join Match */}
        <JoinMatchCard openMatches={openMatches} isAccepting={isAccepting} acceptMatch={acceptMatch} />
      </div>

      {/* How It Works */}
      <section className="how-section">
        <h2>How It Works</h2>
        <div className="how-grid">
          <div className="how-card"><div className="how-num">1</div><h3>Create</h3><p>Set a wager and open a match.</p></div>
          <div className="how-card"><div className="how-num">2</div><h3>Join</h3><p>Pick any open match to enter.</p></div>
          <div className="how-card"><div className="how-num">3</div><h3>Race &amp; Win</h3><p>Type fastest to win the pot.</p></div>
        </div>
      </section>

      <FAQ />
    </div>
  );

  const CAN_CANCEL = matchStatus === "waiting" && timeLeft === 0;

  const WaitingView = () =>
    currentMatch && matchStatus === "waiting" ? (
      <div className="match-screen">
        <div className="match-panel">
          <div className="panel-header">
            <h2>Match Lobby</h2>
            <div className="pill">{currentMatch.amount} SOL</div>
          </div>

          <div className="panel-grid">
            <div className="panel card">
              <h3>Match Info</h3>
              <div className="kv"><span>Match ID:</span><span>#{currentMatch.id.slice(0, 6)}</span></div>
              <div className="kv"><span>Creator:</span><span>{currentMatch.creator.slice(0, 6)}…</span></div>
              <div className="kv"><span>Status:</span><span className="ok">{timeLeft > 0 ? `Cancelable in ${timeLeft}s` : "Cancelable now"}</span></div>
            </div>

            <div className="panel card">
              <h3>Players</h3>
              <div className="player-row you"><div className="dot" /><div className="who">You</div><div className="addr">{walletAddressRef.current.slice(0, 6)}…</div></div>
              <div className="player-row"><div className="dot muted" /><div className="who muted">Waiting for player…</div></div>
            </div>
          </div>

          <div className="panel-actions">
            <button className="btn danger" onClick={() => cancelMatch(currentMatch)} disabled={!CAN_CANCEL}
              title={timeLeft > 0 ? `You can cancel in ${timeLeft}s` : "Cancel match"}>
              {timeLeft > 0 ? `Cancel in ${timeLeft}s` : "Cancel Match"}
            </button>
          </div>
        </div>
      </div>
    ) : null;

  const ReadyOrRacingView = () =>
    currentMatch && (matchStatus === "ready" || matchStatus === "racing") ? (
      <div className="match-screen">
        <div className="race-wrap">
          {matchStatus === "ready" ? (
            <div className="start-count">
              <div className="big-ring"><div className="ring-inner">{countdown}</div></div>
              <div className="start-text">Race Starting</div>
              <div className="muted">Get ready to type!</div>
            </div>
          ) : (
            <>
              <div className="sentence card mono">
                {renderHighlightedSentence(sentence, inputValue, hasError)}
              </div>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInput}
                onPaste={handleInput}
                onKeyDown={preventSelectAll}   // ⬅️ block Ctrl/Cmd+A only in this input
                placeholder="Start typing…"
                disabled={isInputDisabled}
                autoFocus
                className={`type-input mono ${hasError ? "error" : ""}`}
              />
              {hasError && <div className="error-note">Mistake detected — correct it.</div>}

              <div className="track">
                <div className="lane">
                  <div className="car player" style={{ left: `calc(${playerProgress * 100}% - 32px)` }} aria-label="Your car">
                    <CarPlayerSVG />
                  </div>
                </div>
                <div className="lane">
                  <div className="car foe" style={{ left: `calc(${opponentProgress * 100}% - 32px)` }} aria-label="Opponent car">
                    <CarOpponentSVG />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    ) : null;

  const ResultsView = () =>
    matchStatus === "finished" && currentMatch ? (
      <div className="match-screen">
        <div className="results-card card">
          {raceResult?.result === "win" ? (
            <>
              <div className="result-emoji">🏆</div>
              <h2 className="result-title ok">Victory!</h2>
              <p className="muted">Claim your prize of {currentMatch.amount} SOL</p>
              <div className="actions">
                <button className="btn primary" onClick={async () => {
                  try {
                    const ix = await buildResolveIxn(currentMatch.id, walletAddressRef.current);
                    const tx = new Transaction().add(ix);
                    await wallet.sendTransaction(tx, connection);
                    resetGame();
                  } catch (e) {
                    console.error("Claim error:", e);
                    alert("Payout error:\n" + e.message);
                  }
                }}>Claim Winnings</button>
                <button className="btn outline" onClick={resetGame}>Back to Home</button>
              </div>
            </>
          ) : (
            <>
              <div className="result-emoji">❌</div>
              <h2 className="result-title danger">Defeat</h2>
              <p className="muted">Better luck next time.</p>
              <div className="actions">
                <button className="btn outline" onClick={resetGame}>Back to Home</button>
              </div>
            </>
          )}
        </div>

        <div className="chat card">
          <h3>Match Chat</h3>
          <div className="chat-messages">
            {chatMessages.map((msg, i) => (
              <p key={i} className={msg.sender === walletAddressRef.current ? "self" : "other"}>
                <strong>{msg.sender.slice(0, 6)}…:</strong> {msg.message}
              </p>
            ))}
          </div>
          <div className="chat-input">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                socket.emit("message", {
                  matchId: currentMatch.id,
                  sender: walletAddressRef.current,
                  message: chatInput,
                }) &&
                setChatInput("")
              }
              placeholder="Type message…"
            />
            <button
              className="btn"
              disabled={!chatInput.trim()}
              onClick={() => {
                socket.emit("message", {
                  matchId: currentMatch.id,
                  sender: walletAddressRef.current,
                  message: chatInput,
                });
                setChatInput("");
              }}
            >Send</button>
          </div>
        </div>
      </div>
    ) : null;

  // ensure cancel window starts for creator
  useEffect(() => {
    if (currentMatch && matchStatus === "waiting" && !matchCreatedAt) {
      setMatchCreatedAt(Date.now());
    }
  }, [currentMatch, matchStatus, matchCreatedAt]);

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

        {connected ? (
          <div className="wallet-actions">
            <div className="wallet-pill">
              {walletAddressRef.current.slice(0, 6)}… ({walletBalance.toFixed(2)} SOL)
            </div>
            <button
              className="btn outline"
              onClick={() => {
                try { wallet.disconnect?.(); } catch {}
                resetGame();
              }}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <WalletMultiButton className="connect-btn" />
        )}
      </header>

      {!currentMatch && renderHome()}
      {WaitingView()}
      {ReadyOrRacingView()}
      {ResultsView()}
    </div>
  );
}
