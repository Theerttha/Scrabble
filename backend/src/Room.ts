// Room management functionality

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

export interface PendingJoinRequest {
  player: Player;
  roomCode: string;
}

// In-memory storage (use Redis or database in production)
export const rooms = new Map<string, Room>();
export const playerRooms = new Map<string, string>(); // socketId -> roomCode
export const pendingRequests = new Map<string, PendingJoinRequest>(); // socketId -> request
export const disconnectedPlayers = new Map<string, { player: Player, roomCode: string, disconnectedAt: Date }>();

// Utility functions
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Ensure uniqueness
  if (rooms.has(result)) {
    return generateRoomCode();
  }
  
  return result;
}

export function isUsernameAvailable(roomCode: string, username: string, excludeSocketId?: string): boolean {
  const room = rooms.get(roomCode);
  if (!room) return true;
  
  return !room.players.some(player => 
    player.username.toLowerCase() === username.toLowerCase() && 
    player.socketId !== excludeSocketId
  );
}

export function handlePlayerDisconnection(socketId: string): { room: Room | null, disconnectedPlayer: string | null } {
  const roomCode = playerRooms.get(socketId);
  if (!roomCode) return { room: null, disconnectedPlayer: null };
  
  const room = rooms.get(roomCode);
  if (!room) return { room: null, disconnectedPlayer: null };
  
  const playerIndex = room.players.findIndex(p => p.socketId === socketId);
  if (playerIndex === -1) return { room: null, disconnectedPlayer: null };
  
  const player = room.players[playerIndex];
  const disconnectedPlayerName = player.username;
  
  // Mark player as disconnected instead of removing immediately
  player.connected = false;
  player.lastSeen = new Date();
  playerRooms.delete(socketId);
  
  // Store disconnection info for potential reconnection
  disconnectedPlayers.set(player.username.toLowerCase() + ':' + roomCode, {
    player: { ...player },
    roomCode,
    disconnectedAt: new Date()
  });
  
  // Check if all players are disconnected
  const connectedPlayers = room.players.filter(p => p.connected);
  
  if (connectedPlayers.length === 0) {
    room.emptyAt = new Date();
    console.log(`Room ${roomCode} is now empty, marked for potential cleanup`);
  } else {
    // If host disconnected, assign new host to a connected player
    if (room.host.socketId === socketId) {
      const newHost = connectedPlayers[0];
      if (newHost) {
        room.host = newHost;
        newHost.isHost = true;
        console.log(`New host assigned in room ${roomCode}: ${newHost.username}`);
      }
    }
  }
  
  return { room, disconnectedPlayer: disconnectedPlayerName };
}

export function handleReconnection(socketId: string, username: string, roomCode: string): boolean {
  const disconnectionKey = username.toLowerCase() + ':' + roomCode;
  const disconnectionInfo = disconnectedPlayers.get(disconnectionKey);
  
  if (!disconnectionInfo) return false;
  
  const room = rooms.get(roomCode);
  if (!room) {
    disconnectedPlayers.delete(disconnectionKey);
    return false;
  }
  
  // Check if disconnection was recent (within 5 minutes)
  const timeSinceDisconnection = new Date().getTime() - disconnectionInfo.disconnectedAt.getTime();
  if (timeSinceDisconnection > 5 * 60 * 1000) { // 5 minutes
    disconnectedPlayers.delete(disconnectionKey);
    return false;
  }
  
  // Find the player in the room and reconnect
  const playerIndex = room.players.findIndex(p => 
    p.username.toLowerCase() === username.toLowerCase() && !p.connected
  );
  
  if (playerIndex !== -1) {
    const player = room.players[playerIndex];
    player.socketId = socketId;
    player.connected = true;
    player.lastSeen = new Date();
    
    playerRooms.set(socketId, roomCode);
    disconnectedPlayers.delete(disconnectionKey);
    
    // Clear empty room marker if room is no longer empty
    if (room.emptyAt) {
      delete room.emptyAt;
    }
    
    console.log(`Player ${username} reconnected to room ${roomCode}`);
    return true;
  }
  
  return false;
}

// Cleanup old rooms and disconnected players
export function startRoomCleanup(): void {
  setInterval(() => {
    const now = new Date();
    const maxRoomAge = 2 * 60 * 60 * 1000; // 2 hours
    const maxEmptyTime = 10 * 60 * 1000; // 10 minutes for empty rooms
    const maxDisconnectionTime = 5 * 60 * 1000; // 5 minutes for disconnected players
    
    // Clean up old rooms
    for (const [roomCode, room] of rooms.entries()) {
      const roomAge = now.getTime() - room.createdAt.getTime();
      const emptyTime = room.emptyAt ? now.getTime() - room.emptyAt.getTime() : 0;
      
      // Delete if room is very old OR has been empty for too long
      if (roomAge > maxRoomAge || (room.emptyAt && emptyTime > maxEmptyTime)) {
        // Remove all players from tracking
        room.players.forEach(player => {
          playerRooms.delete(player.socketId);
          const disconnectionKey = player.username.toLowerCase() + ':' + roomCode;
          disconnectedPlayers.delete(disconnectionKey);
        });
        
        rooms.delete(roomCode);
        console.log(`Cleaned up room: ${roomCode} (age: ${Math.round(roomAge/1000/60)}min, empty: ${Math.round(emptyTime/1000/60)}min)`);
        continue;
      }
      
      // Remove old disconnected players from the room
      room.players = room.players.filter(player => {
        if (player.connected) return true;
        
        const timeSinceLastSeen = now.getTime() - player.lastSeen.getTime();
        if (timeSinceLastSeen > maxDisconnectionTime) {
          const disconnectionKey = player.username.toLowerCase() + ':' + roomCode;
          disconnectedPlayers.delete(disconnectionKey);
          console.log(`Removed disconnected player ${player.username} from room ${roomCode}`);
          return false;
        }
        return true;
      });
      
      // Update room empty status
      const connectedPlayers = room.players.filter(p => p.connected);
      if (connectedPlayers.length === 0 && !room.emptyAt) {
        room.emptyAt = new Date();
      } else if (connectedPlayers.length > 0 && room.emptyAt) {
        delete room.emptyAt;
      }
    }
    
    // Clean up old disconnection records
    for (const [key, info] of disconnectedPlayers.entries()) {
      const timeSinceDisconnection = now.getTime() - info.disconnectedAt.getTime();
      if (timeSinceDisconnection > maxDisconnectionTime) {
        disconnectedPlayers.delete(key);
      }
    }
  }, 2 * 60 * 1000);
}