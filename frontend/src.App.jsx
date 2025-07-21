import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import sentences from "./sentences";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import socket from "./socket";
import { setProvider } from "./solana";
import {
  initializeEscrow,
  joinEscrow,
  depositToEscrow,
  resolveEscrow,
  cancelEscrow,
  joinAndDeposit, // <-- NEW
} from "./escrow";

export default function App() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, connected } = wallet;
  const walletConnected = connected;
  const walletAddress = publicKey?.toBase58() || "";

  useEffect(() => {
    if (connected) setProvider(wallet);
  }, [connected, wallet]);

  const [walletBalance, setWalletBalance] = useState(0);
  useEffect(() => {
    if (!connection || !publicKey) return;
    connection
      .getBalance(publicKey)
      .then((lamports) => setWalletBalance(lamports / LAMPORTS_PER_SOL))
      .catch((err) => {
        console.warn("Could not fetch wallet balance:", err);
      });
  }, [connection, publicKey]);

  const [wager, setWager] = useState(1);
  const [openMatches, setOpenMatches] = useState([]);
  const [currentMatch, setCurrentMatch] = useState(null);
  const [escrowPda, setEscrowPda] = useState(null);

  const [matchStatus, setMatchStatus] = useState("waiting");
  const [sentence, setSentence] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [playerProgress, setPlayerProgress] = useState(0);
  const [opponentProgress, setOpponentProgress] = useState(0);

  const [countdown, setCountdown] = useState(3);
  const [raceResult, setRaceResult] = useState(null);
  const [isInputDisabled, setIsInputDisabled] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [opponentWallet, setOpponentWallet] = useState(null);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  const inputRef = useRef(null);
  const API = process.env.REACT_APP_API_URL;

  const [lastProgTime, setLastProgTime] = useState(Date.now());
  const [lastProg, setLastProg] = useState(0);
  const MAX_CPS = 20;

  useEffect(() => {
    socket.connect();

    socket.on("openMatches", (ms) => setOpenMatches(ms));
    socket.on("newMatch", (m) => setOpenMatches((os) => [...os, m]));
    socket.on("removeMatch", (id) =>
      setOpenMatches((os) => os.filter((m) => m.id !== id))
    );

    socket.on("startMatch", ({ id, players }) => {
      if (currentMatch?.id === id) {
        setMatchStatus("ready");
        setSentence(chooseSentence(id));
        setCountdown(3);
        setOpponentWallet(players.find((w) => w !== walletAddress));
      }
    });

    socket.on("opponentProgress", ({ wallet: w, progress }) => {
      if (w !== walletAddress) setOpponentProgress(progress);
    });

    socket.on("raceEnd", ({ winner, progressMap }) => {
      setMatchStatus("finished");
      setIsInputDisabled(true);
      setRaceResult({ result: winner === walletAddress ? "win" : "lose" });
      if (progressMap) {
        setPlayerProgress(progressMap[walletAddress] ?? 0);
        setOpponentProgress(progressMap[opponentWallet] ?? 0);
      }
    });

    socket.on("chat", (msgs) => setChatMessages(msgs));

    socket.on("opponentLeft", async () => {
      if (
        matchStatus === "finished" &&
        raceResult?.result === "win" &&
        currentMatch?.id
      ) {
        try {
          await resolveEscrow(new PublicKey(currentMatch.id), publicKey);
        } catch (e) {
          console.error("Auto-claim failed:", e);
        }
      }
      resetGame();
    });

    return () => socket.removeAllListeners();
  }, [
    currentMatch,
    walletAddress,
    opponentWallet,
    matchStatus,
    raceResult,
    publicKey,
  ]);

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

  const chooseSentence = (id) => {
    const sum = Array.from(id).reduce((a, c) => a + c.charCodeAt(0), 0);
    return sentences[sum % sentences.length];
  };
  const fetchOpenMatches = async () => {
    try {
      const res = await fetch(`${API}/wagers`);
      setOpenMatches(await res.json());
    } catch {}
  };
  const resetGame = () => {
    setCurrentMatch(null);
    setEscrowPda(null);
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
    fetchOpenMatches();
  };

  // ----- KEY UPDATE: no confirmation waits -----

  const createMatch = async () => {
    if (!walletConnected) return alert("Connect wallet");
    const lamports = Math.floor(wager * LAMPORTS_PER_SOL);
    try {
      const pda = await initializeEscrow(lamports);
      setEscrowPda(pda);

      // UI continues instantly!
      const id = pda.toBase58();
      await fetch(`${API}/wagers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          amount: Number(wager),
          creator: walletAddress,
          feePercent: 5,
        }),
      });
      setCurrentMatch({ id, amount: Number(wager), creator: walletAddress });
      socket.emit("joinMatch", id);
      setMatchStatus("waiting");
    } catch (e) {
      console.error("createMatch failed:", e);
      alert(`Failed to create match:\n${e.message || e}`);
    }
  };

  const acceptMatch = async (m) => {
    if (!walletConnected) return alert("Connect wallet");
    setIsAccepting(true);
    const pda = new PublicKey(m.id);
    setEscrowPda(pda);

    socket.emit("joinMatch", m.id);
    setCurrentMatch({ ...m, accepter: walletAddress });

    try {
      await joinAndDeposit(pda); // <-- Only one popup, one signature now!
      await fetch(`${API}/wagers/${m.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepter: walletAddress }),
      });
      setMatchStatus("ready");
      setCountdown(3);
    } catch (e) {
      console.error("acceptMatch failed:", e);
      alert(`Failed to accept match:\n${e.message || e}`);
      setCurrentMatch(null);
    } finally {
      setIsAccepting(false);
    }
  };

  const cancelMatch = async (m) => {
    try {
      await cancelEscrow(
        new PublicKey(m.id),
        new PublicKey(m.creator),
        new PublicKey(m.accepter || m.creator)
      );
      await fetch(`${API}/wagers/${m.id}/cancel`, { method: "POST" });
      resetGame();
    } catch (e) {
      console.error("cancelMatch failed:", e);
      alert(`Failed to cancel match:\n${e.message || e}`);
    }
  };

  const handleInput = (e) => {
    if (isInputDisabled) return;
    if (e.type === "paste") {
      e.preventDefault();
      return;
    }
    const now = Date.now();
    const val = e.target.value;
    const rawProg = Math.min(1, val.length / sentence.length);
    const deltaProg = rawProg - lastProg;
    const deltaTime = (now - lastProgTime) / 1000;
    const chars = deltaProg * sentence.length;
    const cps = deltaTime > 0 ? chars / deltaTime : 0;
    if (cps > MAX_CPS) return;
    setLastProg(rawProg);
    setLastProgTime(now);
    setInputValue(val);
    setPlayerProgress(rawProg);
    socket.emit("progress", {
      matchId: currentMatch.id,
      wallet: walletAddress,
      progress: rawProg,
    });
    if (val === sentence) {
      fetch(`${API}/wagers/${currentMatch.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner: walletAddress }),
      });
      setMatchStatus("finished");
      setIsInputDisabled(true);
      setRaceResult({ result: "win" });
    }
  };

  // -- UI Renderers below here: unchanged from your logic --

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
          onChange={(e) => setWager(e.target.value)}
          disabled={!!currentMatch}
        />
      </label>
      <button
        onClick={createMatch}
        disabled={!wager || wager <= 0 || !!currentMatch}
      >
        Create Match
      </button>
      <h2 style={{ marginTop: 20 }}>Open Matches</h2>
      {openMatches.length === 0 ? (
        <p>No open matches. Create one!</p>
      ) : (
        <ul>
          {openMatches.map((m) => (
            <li key={m.id}>
              {m.id.slice(0, 6)}… | {m.amount} SOL{" "}
              {m.creator === walletAddress ? (
                <button
                  onClick={() => cancelMatch(m)}
                  style={{ marginLeft: 10 }}
                >
                  Cancel
                </button>
              ) : (
                <button
                  onClick={() => acceptMatch(m)}
                  disabled={!!currentMatch || isAccepting}
                  style={{ marginLeft: 10 }}
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
      <button onClick={() => cancelMatch(currentMatch)}>Cancel Match</button>
    </section>
  );
  const renderRace = () => (
    <section className="race-section">
      {matchStatus === "ready" && <h2>Starting in {countdown}</h2>}
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
          />
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
          <h2 style={{ fontSize: "2rem" }}>🏆 You Won!</h2>
          <button
            onClick={async () => {
              try {
                await resolveEscrow(
                  new PublicKey(currentMatch.id),
                  publicKey
                );
                resetGame();
              } catch (e) {
                console.error(e);
                alert("Payout error: " + (e.message || e));
              }
            }}
          >
            Claim Winnings
          </button>
        </div>
      )}
      {matchStatus === "finished" && raceResult?.result === "lose" && (
        <div className="results results-lose" style={{ textAlign: "center" }}>
          <h2 style={{ fontSize: "2rem", color: "#c0392b" }}>😢 You Lost!</h2>
          <p>Better luck next time!</p>
          <button onClick={resetGame}>Back to Matches</button>
        </div>
      )}
    </section>
  );
  const renderChat = () => (
    <section className="chat-section">
      <h2>Chat</h2>
      <div
        className="chat-messages"
        style={{ maxHeight: 150, overflowY: "auto" }}
      >
        {chatMessages.map((msg, i) => (
          <p key={i} className={msg.sender === walletAddress ? "self" : "other"}>
            <strong>{msg.sender.slice(0, 6)}…:</strong> {msg.message}
          </p>
        ))}
      </div>
      <input
        value={chatInput}
        onChange={(e) => setChatInput(e.target.value)}
        onKeyDown={(e) =>
          e.key === "Enter" &&
          socket.emit("message", {
            matchId: currentMatch.id,
            sender: walletAddress,
            message: chatInput,
          }) &&
          setChatInput("")
        }
      />
      <button
        onClick={() => {
          socket.emit("message", {
            matchId: currentMatch.id,
            sender: walletAddress,
            message: chatInput,
          });
          setChatInput("");
        }}
        disabled={!chatInput.trim()}
      >
        Send
      </button>
    </section>
  );

  return (
    <div className="app">
      <header>
        <h1>Type Racer</h1>
        {walletConnected ? (
          <div className="wallet-info">
            {walletAddress.slice(0, 6)}… ({walletBalance.toFixed(2)} SOL)
          </div>
        ) : (
          <WalletMultiButton />
        )}
      </header>

      {!walletConnected && <p>Please connect your wallet to play.</p>}
      {walletConnected && !currentMatch && renderMatchmaking()}
      {walletConnected &&
        currentMatch &&
        matchStatus === "waiting" &&
        renderWaiting()}
      {walletConnected &&
        currentMatch &&
        (matchStatus === "ready" ||
          matchStatus === "racing" ||
          matchStatus === "finished") &&
        renderRace()}
      {walletConnected && currentMatch && matchStatus === "finished" && renderChat()}
    </div>
  );
}
