import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import {
  registerRoomHandlers,
  rooms,
  playerRooms,
  disconnectedPlayers,
} from "./Room";

dotenv.config();

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    activeRooms: rooms.size,
    timestamp: new Date().toISOString(),
  });
});

// Socket.IO
io.on("connection", (socket) => {
  registerRoomHandlers(io, socket);
});

// Cleanup (optional – can be left in room.ts too)
setInterval(() => {
  const now = new Date();
  for (const [key, info] of disconnectedPlayers.entries()) {
    const elapsed = now.getTime() - info.disconnectedAt.getTime();
    if (elapsed > 5 * 60 * 1000) {
      disconnectedPlayers.delete(key);
    }
  }
}, 2 * 60 * 1000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

export { app, server, io };
