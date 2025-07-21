// src/socket.js
import { io } from "socket.io-client";

const API = process.env.REACT_APP_API_URL || "http://localhost:4000";

const socket = io(API, {
  autoConnect: false,
  transports: ["websocket"],
  path: "/socket.io",    // only needed if you changed this on the server
});

export default socket;
