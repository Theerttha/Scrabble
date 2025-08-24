// src/socket.js
import { io } from "socket.io-client";

const backend_url = import.meta.env.VITE_URL || "http://localhost:3000";

export const socket = io(backend_url, {
  transports: ["websocket"],
  autoConnect: true,
});
