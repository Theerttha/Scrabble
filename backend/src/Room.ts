import { Server, Socket } from "socket.io";

// --------------------
// Types
// --------------------
export interface Player {
  id: string;
  username: string;
  isHost: boolean;
  socketId: string;
  connected: boolean;
  lastSeen: Date;
}

export interface Room {
  roomCode: string;
  host: Player;
  players: Player[];
  maxPlayers: number;
  gameStarted: boolean;
  createdAt: Date;
  emptyAt?: Date;
}

interface PendingJoinRequest {
  player: Player;
  roomCode: string;
}

// --------------------
// In-memory stores
// --------------------
export const rooms = new Map<string, Room>();
export const playerRooms = new Map<string, string>(); // socketId -> roomCode
export const pendingRequests = new Map<string, PendingJoinRequest>();
export const disconnectedPlayers = new Map<
  string,
  { player: Player; roomCode: string; disconnectedAt: Date }
>();

// --------------------
// Utility functions
// --------------------
export function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  if (rooms.has(result)) return generateRoomCode();
  return result;
}

export function isUsernameAvailable(
  roomCode: string,
  username: string,
  excludeSocketId?: string
): boolean {
  const room = rooms.get(roomCode);
  if (!room) return true;
  return !room.players.some(
    (p) =>
      p.username.toLowerCase() === username.toLowerCase() &&
      p.socketId !== excludeSocketId
  );
}

export function handlePlayerDisconnection(socketId: string) {
  const roomCode = playerRooms.get(socketId);
  if (!roomCode) return { room: null, disconnectedPlayer: null };

  const room = rooms.get(roomCode);
  if (!room) return { room: null, disconnectedPlayer: null };

  const idx = room.players.findIndex((p) => p.socketId === socketId);
  if (idx === -1) return { room: null, disconnectedPlayer: null };

  const player = room.players[idx];
  player.connected = false;
  player.lastSeen = new Date();
  playerRooms.delete(socketId);

  const disconnectedPlayerName = player.username;
  disconnectedPlayers.set(player.username.toLowerCase() + ":" + roomCode, {
    player: { ...player },
    roomCode,
    disconnectedAt: new Date(),
  });

  const connectedPlayers = room.players.filter((p) => p.connected);
  if (connectedPlayers.length === 0) {
    room.emptyAt = new Date();
    console.log(`Room ${roomCode} is now empty, marked for cleanup`);
  } else if (room.host.socketId === socketId) {
    const newHost = connectedPlayers[0];
    if (newHost) {
      room.host = newHost;
      newHost.isHost = true;
      console.log(`New host assigned: ${newHost.username}`);
    }
  }

  return { room, disconnectedPlayer: disconnectedPlayerName };
}

export function handleReconnection(
  socketId: string,
  username: string,
  roomCode: string
): boolean {
  const key = username.toLowerCase() + ":" + roomCode;
  const info = disconnectedPlayers.get(key);
  if (!info) return false;

  const room = rooms.get(roomCode);
  if (!room) {
    disconnectedPlayers.delete(key);
    return false;
  }

  const timeSince = Date.now() - info.disconnectedAt.getTime();
  if (timeSince > 5 * 60 * 1000) {
    disconnectedPlayers.delete(key);
    return false;
  }

  const idx = room.players.findIndex(
    (p) => p.username.toLowerCase() === username.toLowerCase() && !p.connected
  );
  if (idx !== -1) {
    const player = room.players[idx];
    player.socketId = socketId;
    player.connected = true;
    player.lastSeen = new Date();

    playerRooms.set(socketId, roomCode);
    disconnectedPlayers.delete(key);
    delete room.emptyAt;

    console.log(`Player ${username} reconnected to ${roomCode}`);
    return true;
  }

  return false;
}

// --------------------
// Socket.IO handlers
// --------------------
export function registerRoomHandlers(io: Server, socket: Socket) {
  console.log(`User connected: ${socket.id}`);

  socket.on("createRoom", (data: { username: string }) => {
    const { username } = data;
    if (!username?.trim()) {
      socket.emit("error", { message: "Username required" });
      return;
    }
    const roomCode = generateRoomCode();
    const host: Player = {
      id: socket.id,
      username: username.trim(),
      isHost: true,
      socketId: socket.id,
      connected: true,
      lastSeen: new Date(),
    };
    const newRoom: Room = {
      roomCode,
      host,
      players: [host],
      maxPlayers: 4,
      gameStarted: false,
      createdAt: new Date(),
    };
    rooms.set(roomCode, newRoom);
    playerRooms.set(socket.id, roomCode);
    socket.join(roomCode);

    socket.emit("roomCreated", { roomCode });
    console.log(`Room ${roomCode} created by ${username}`);
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    handlePlayerDisconnection(socket.id);
  });
}
