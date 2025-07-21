// src/App.jsx

import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import sentences from "./sentences";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import socket from "./socket";
import * as anchor from "@coral-xyz/anchor";
import idl from "./idl/typeracer_escrow.json";
import { setProvider } from "./solana";
import {
  buildInitializeAndDepositIxns,
  buildJoinAndDepositIxn,
  buildCancelIxn,
  buildResolveIxn,
} from "./escrow";

export default function App() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;
  const walletAddress = publicKey?.toBase58() || "";

  const walletAddressRef = useRef(walletAddress);
  useEffect(() => {
    walletAddressRef.current = walletAddress;
  }, [walletAddress]);

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

  const [wager, setWager] = useState(1);
  const [openMatches, setOpenMatches] = useState([]);
  const [currentMatch, setCurrentMatch] = useState(null);
  const [matchStatus, setMatchStatus] = useState("waiting");

  const [matchCreatedAt, setMatchCreatedAt] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
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
  const MAX_CPS = 20;

  const chooseSentence = (id) =>
    sentences[
      Array.from(id).reduce((a, c) => a + c.charCodeAt(0), 0) %
        sentences.length
    ];

  const fetchOpenMatches = async () => {
    try {
      const res = await fetch(`${API}/wagers`);
      const wm = await res.json();
      setOpenMatches(wm.filter((m) => !m.accepter));
    } catch {}
  };

  const resetGame = () => {
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
  };

  useEffect(() => {
    socket.connect();
    socket.on("openMatches", (wm) =>
      setOpenMatches(wm.filter((m) => !m.accepter))
    );
    socket.on("newMatch", (m) =>
      setOpenMatches((os) => [...os, m].filter((x) => !x.accepter))
    );
    socket.on("removeMatch", (id) =>
      setOpenMatches((os) => os.filter((m) => m.id !== id))
    );
    socket.on("startMatch", ({ id, players }) => {
      // MAKE SURE WE'RE IN THE ROOM FOR PROGRESS MESSAGES
      socket.emit("joinMatch", id);
      setPlayerProgress(0);
      setOpponentProgress(0);
      setCurrentMatch({
        id,
        amount: currentMatch?.amount || 0,
        creator: players[0],
        accepter: players[1],
        nonce: currentMatch?.nonce,
      });
      setMatchStatus("ready");
      setSentence(chooseSentence(id));
      setCountdown(3);
      setOpponentWallet(players.find((w) => w !== walletAddressRef.current));
      setHasError(false);
    });
    socket.on("opponentProgress", ({ wallet: w, progress }) => {
      if (w !== walletAddressRef.current) setOpponentProgress(progress);
    });
    socket.on("raceEnd", ({ winner, progressMap }) => {
      setMatchStatus("finished");
      setIsInputDisabled(true);
      setRaceResult({
        result: winner === walletAddressRef.current ? "win" : "lose",
      });
      if (progressMap) {
        setPlayerProgress(progressMap[walletAddressRef.current] ?? 0);
        setOpponentProgress(progressMap[opponentWallet] ?? 0);
      }
    });
    socket.on("chat", setChatMessages);
    socket.on("opponentLeft", resetGame);
    fetchOpenMatches();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);

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

  const CAN_CANCEL = timeLeft === 0 && matchStatus === "waiting";

  async function createMatch() {
    if (!connected) return alert("Connect wallet");
    try {
      const lamports = Math.floor(wager * LAMPORTS_PER_SOL);
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
          amount: Number(wager),
          creator: walletAddressRef.current,
          feePercent: 5,
          nonce,
        }),
      });

      setCurrentMatch({
        id,
        amount: Number(wager),
        creator: walletAddressRef.current,
        nonce,
      });
      setMatchCreatedAt(Date.now());
      setMatchStatus("waiting");
      socket.emit("joinMatch", id);
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

      setMatchStatus("ready");
      setSentence(chooseSentence(m.id));
      setCountdown(3);

      await fetch(`${API}/wagers/${m.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepter: walletAddressRef.current }),
      });
      setCurrentMatch({ ...m, accepter: walletAddressRef.current });
      socket.emit("joinMatch", m.id);
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
    if (!CAN_CANCEL) return;
    try {
      const ix = await buildCancelIxn(
        m.id,
        m.creator,
        m.accepter || m.creator
      );
      await wallet.sendTransaction(new Transaction().add(ix), connection);
      await fetch(`${API}/wagers/${m.id}/cancel`, { method: "POST" });
      resetGame();
    } catch (e) {
      console.error("Cancel error:", e);
      alert("Cancel error:\n" + e.message);
    }
  }

  function handleInput(e) {
    if (isInputDisabled) return;
    if (e.type === "paste") {
      e.preventDefault();
      return;
    }
    const val = e.target.value;
    if (!sentence.startsWith(val)) {
      setHasError(true);
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
    socket.emit("progress", {
      matchId: currentMatch.id,
      wallet: walletAddressRef.current,
      progress: raw,
    });

    if (val === sentence) {
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

  const renderMatchmaking = () => (
    <section className="matchmaking">
      <h2>Create a Match</h2>
      <label>
        Wager (SOL):
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={wager}
          onChange={(e) => setWager(Number(e.target.value))}
        />
      </label>
      <button onClick={createMatch} disabled={!wager || wager <= 0}>
        Create Match
      </button>

      <h2 className="subheading">Open Matches</h2>
      {openMatches.length === 0 ? (
        <p className="empty">No open matches. Create one!</p>
      ) : (
        <ul className="match-list">
          {openMatches.map((m) => (
            <li key={m.id}>
              <span className="match-info">
                {m.id.slice(0, 6)}… | {m.amount} SOL
              </span>
              {m.creator === walletAddressRef.current ? (
                <div className="match-controls">
                  <button
                    className="btn-cancel"
                    onClick={() => cancelMatch(m)}
                    disabled={!CAN_CANCEL}
                  >
                    Cancel
                  </button>
                  {!CAN_CANCEL && (
                    <span className="cancel-timer">({timeLeft}s)</span>
                  )}
                </div>
              ) : (
                <button
                  className="btn-accept"
                  onClick={() => acceptMatch(m)}
                  disabled={!!currentMatch || isAccepting}
                >
                  {isAccepting ? "Accepting…" : "Accept"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const renderWaiting = () => (
    <section className="waiting-section">
      <h2>Waiting for opponent…</h2>
      <button
        className="btn-cancel"
        onClick={() => cancelMatch(currentMatch)}
        disabled={!CAN_CANCEL}
      >
        Cancel Match
      </button>
      {!CAN_CANCEL && (
        <div className="cancel-timer">
          Cancellation in {timeLeft}s
        </div>
      )}
    </section>
  );

  const renderRace = () => (
    <section className="race-section">
      {matchStatus === "ready" && (
        <h2 className="countdown">Starting in {countdown}</h2>
      )}
      {matchStatus === "racing" && (
        <>
          <div className="sentence-display">{sentence}</div>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInput}
            onPaste={handleInput}
            placeholder="Start typing…"
            disabled={isInputDisabled}
            autoFocus
            className={hasError ? "input-error" : ""}
          />
          {hasError && (
            <div className="error-text">
              Mistake detected – correct it before continuing.
            </div>
          )}
          <div className="track">
            <div className="lane">
              <div
                className="car car-player"
                style={{ left: `${playerProgress * 100}%` }}
              >
                🚗
              </div>
            </div>
            <div className="lane">
              <div
                className="car car-opponent"
                style={{ left: `${opponentProgress * 100}%` }}
              >
                🏎️
              </div>
            </div>
          </div>
        </>
      )}
      {matchStatus === "finished" && raceResult?.result === "win" && (
        <div className="results results-win">
          <h2>🏆 You Won!</h2>
          <button
            className="btn-claim"
            onClick={async () => {
              try {
                const ix = await buildResolveIxn(
                  currentMatch.id,
                  walletAddressRef.current
                );
                const tx = new Transaction().add(ix);
                await wallet.sendTransaction(tx, connection);
                resetGame();
              } catch (e) {
                console.error("Claim error:", e);
                alert("Payout error:\n" + e.message);
              }
            }}
          >
            Claim Winnings
          </button>
        </div>
      )}
      {matchStatus === "finished" && raceResult?.result === "lose" && (
        <div className="results results-lose">
          <h2>😢 You Lost!</h2>
          <p>Better luck next time.</p>
          <button className="btn-back" onClick={resetGame}>
            Back to Matches
          </button>
        </div>
      )}
    </section>
  );

  const renderChat = () => (
    <section className="chat-section">
      <h2>Chat</h2>
      <div className="chat-messages">
        {chatMessages.map((msg, i) => (
          <p
            key={i}
            className={msg.sender === walletAddressRef.current ? "self" : "other"}
          >
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
        <button className="btn-send" disabled={!chatInput.trim()}>
          Send
        </button>
      </div>
    </section>
  );

  return (
    <div className="app">
      <header>
        <h1 className="title">Type Racer</h1>
        {connected ? (
          <div className="wallet-info">
            {walletAddressRef.current.slice(0, 6)}… (
            {walletBalance.toFixed(2)} SOL)
          </div>
        ) : (
          <WalletMultiButton className="connect-btn" />
        )}
      </header>

      {!connected && <p className="center-note">Please connect your wallet to play.</p>}
      {connected && !currentMatch && renderMatchmaking()}
      {connected && currentMatch && matchStatus === "waiting" && renderWaiting()}
      {connected &&
        currentMatch &&
        (matchStatus === "ready" ||
          matchStatus === "racing" ||
          matchStatus === "finished") &&
        renderRace()}
      {connected && currentMatch && matchStatus === "finished" && renderChat()}
    </div>
  );
}
