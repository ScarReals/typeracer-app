import React from "react";
import ReactDOM from "react-dom/client";
import "./App.css";

import App from "./App";
import LeaderboardPage from "./LeaderboardPage";

import { BrowserRouter, Routes, Route } from "react-router-dom";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter
} from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";

const rpcUrl =
  process.env.REACT_APP_SOLANA_RPC ||
  process.env.REACT_APP_SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ConnectionProvider endpoint={rpcUrl}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<App />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
            </Routes>
          </BrowserRouter>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>
);
