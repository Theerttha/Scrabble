import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from "dotenv";
import { 
  rooms, 
  playerRooms, 
  pendingRequests, 
  generateRoomCode, 
  isUsernameAvailable, 
  handlePlayerDisconnection, 
  handleReconnection, 
  startRoomCleanup,
  Player 
} from './Room';
import { registerGameHandlers } from './Game';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Register game handlers
  registerGameHandlers(io, socket);
  
  // Create room event
  socket.on('createRoom', (data: { username: string }) => {
    try {
      const { username } = data;
      
      if (!username || username.trim().length === 0) {
        socket.emit('error', { 
          message: 'Username is required', 
          type: 'validation_error' 
        });
        return;
      }
      
      if (username.length > 20) {
        socket.emit('error', { 
          message: 'Username must be 20 characters or less', 
          type: 'validation_error' 
        });
        return;
      }
      
      const roomCode = generateRoomCode();
      const host: Player = {
        id: socket.id,
        username: username.trim(),
        isHost: true,
        socketId: socket.id,
        connected: true,
        lastSeen: new Date()
      };
      
      const newRoom = {
        roomCode,
        host,
        players: [host],
        maxPlayers: 4,
        gameStarted: false,
        createdAt: new Date()
      };
      
      rooms.set(roomCode, newRoom);
      playerRooms.set(socket.id, roomCode);
      socket.join(roomCode);
      
      socket.emit('roomCreated', { 
        roomCode,
        shareLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/join/${roomCode}`
      });
      
      console.log(`Room ${roomCode} created by ${username}`);
      
    } catch (error) {
      console.error('Error creating room:', error);
      socket.emit('error', { 
        message: 'Failed to create room', 
        type: 'server_error' 
      });
    }
  });
  
  // Join room event
  socket.on('joinRoom', (data: { username: string, roomCode: string }) => {
    try {
      const { username, roomCode } = data;
      
      if (!username || !roomCode) {
        socket.emit('error', { 
          message: 'Username and room code are required', 
          type: 'validation_error' 
        });
        return;
      }
      
      if (username.length > 20) {
        socket.emit('error', { 
          message: 'Username must be 20 characters or less', 
          type: 'validation_error' 
        });
        return;
      }
      
      const room = rooms.get(roomCode.toUpperCase());
      if (!room) {
        socket.emit('error', { 
          message: 'Room not found', 
          type: 'room_not_found' 
        });
        return;
      }
      
      // Check for reconnection first
      if (handleReconnection(socket.id, username, roomCode.toUpperCase())) {
        socket.join(roomCode.toUpperCase());
        
        const reconnectedPlayer = room.players.find(p => 
          p.username.toLowerCase() === username.toLowerCase() && p.connected
        );
        
        if (reconnectedPlayer?.isHost) {
          room.host = reconnectedPlayer;
        }
        
        socket.emit('joinApproved', { players: room.players.filter(p => p.connected) });
        
        socket.to(roomCode.toUpperCase()).emit('playerApproved', { 
          players: room.players.filter(p => p.connected),
          newPlayer: reconnectedPlayer
        });
        
        console.log(`${username} reconnected to room ${roomCode.toUpperCase()}`);
        return;
      }
      
      if (room.gameStarted) {
        socket.emit('error', { 
          message: 'Game has already started', 
          type: 'game_in_progress' 
        });
        return;
      }
      
      const connectedPlayers = room.players.filter(p => p.connected);
      if (connectedPlayers.length >= room.maxPlayers) {
        socket.emit('error', { 
          message: 'Room is full', 
          type: 'room_full' 
        });
        return;
      }
      
      if (!isUsernameAvailable(roomCode.toUpperCase(), username)) {
        socket.emit('error', { 
          message: 'Username is already taken in this room', 
          type: 'username_taken' 
        });
        return;
      }
      
      const player: Player = {
        id: socket.id,
        username: username.trim(),
        isHost: false,
        socketId: socket.id,
        connected: true,
        lastSeen: new Date()
      };
      
      pendingRequests.set(socket.id, { player, roomCode: roomCode.toUpperCase() });
      
      const connectedHost = room.players.find(p => p.isHost && p.connected);
      if (connectedHost) {
        socket.to(connectedHost.socketId).emit('playerJoinRequest', { player });
      }
      
      socket.emit('joinedRoom', { roomCode: roomCode.toUpperCase() });
      
      console.log(`${username} requested to join room ${roomCode}`);
      
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { 
        message: 'Failed to join room', 
        type: 'server_error' 
      });
    }
  });
  
  // Approve player event
  socket.on('approvePlayer', (data: { playerSocketId: string }) => {
    try {
      const { playerSocketId } = data;
      const roomCode = playerRooms.get(socket.id);
      
      if (!roomCode) {
        socket.emit('error', { 
          message: 'You are not in a room', 
          type: 'not_in_room' 
        });
        return;
      }
      
      const room = rooms.get(roomCode);
      if (!room || room.host.socketId !== socket.id) {
        const isConnectedHost = room && room.players.some(p => 
          p.socketId === socket.id && p.isHost && p.connected
        );
        
        if (!isConnectedHost) {
          socket.emit('error', { 
            message: 'You are not the host', 
            type: 'not_host' 
          });
          return;
        }
      }
      
      const pendingRequest = pendingRequests.get(playerSocketId);
      if (!pendingRequest) {
        socket.emit('error', { 
          message: 'Join request not found', 
          type: 'request_not_found' 
        });
        return;
      }
      
      if (!isUsernameAvailable(roomCode, pendingRequest.player.username)) {
        socket.to(playerSocketId).emit('error', { 
          message: 'Username is no longer available', 
          type: 'username_taken' 
        });
        pendingRequests.delete(playerSocketId);
        return;
      }
      
      room.players.push(pendingRequest.player);
      playerRooms.set(playerSocketId, roomCode);
      pendingRequests.delete(playerSocketId);
      
      const playerSocket = io.sockets.sockets.get(playerSocketId);
      if (playerSocket) {
        playerSocket.join(roomCode);
      }
      
      const connectedPlayers = room.players.filter(p => p.connected);
      io.to(roomCode).emit('playerApproved', { 
        players: connectedPlayers,
        newPlayer: pendingRequest.player
      });
      
      socket.to(playerSocketId).emit('joinApproved', { players: connectedPlayers });
      
      console.log(`${pendingRequest.player.username} approved to join room ${roomCode}`);
      
    } catch (error) {
      console.error('Error approving player:', error);
      socket.emit('error', { 
        message: 'Failed to approve player', 
        type: 'server_error' 
      });
    }
  });
  
  // Decline player event
  socket.on('declinePlayer', (data: { playerSocketId: string }) => {
    try {
      const { playerSocketId } = data;
      const roomCode = playerRooms.get(socket.id);
      
      if (!roomCode) {
        socket.emit('error', { 
          message: 'You are not in a room', 
          type: 'not_in_room' 
        });
        return;
      }
      
      const room = rooms.get(roomCode);
      if (!room || room.host.socketId !== socket.id) {
        const isConnectedHost = room && room.players.some(p => 
          p.socketId === socket.id && p.isHost && p.connected
        );
        
        if (!isConnectedHost) {
          socket.emit('error', { 
            message: 'You are not the host', 
            type: 'not_host' 
          });
          return;
        }
      }
      
      const pendingRequest = pendingRequests.get(playerSocketId);
      if (pendingRequest) {
        pendingRequests.delete(playerSocketId);
        socket.to(playerSocketId).emit('joinDeclined');
        
        console.log(`${pendingRequest.player.username} declined from room ${roomCode}`);
      }
      
    } catch (error) {
      console.error('Error declining player:', error);
      socket.emit('error', { 
        message: 'Failed to decline player', 
        type: 'server_error' 
      });
    }
  });
  
  // Start game event
  socket.on('startGame', () => {
    try {
      const roomCode = playerRooms.get(socket.id);
      
      if (!roomCode) {
        socket.emit('error', { 
          message: 'You are not in a room', 
          type: 'not_in_room' 
        });
        return;
      }
      
      const room = rooms.get(roomCode);
      if (!room || room.host.socketId !== socket.id) {
        const isConnectedHost = room && room.players.some(p => 
          p.socketId === socket.id && p.isHost && p.connected
        );
        
        if (!isConnectedHost) {
          socket.emit('error', { 
            message: 'You are not the host', 
            type: 'not_host' 
          });
          return;
        }
      }
      
      const connectedPlayers = room.players.filter(p => p.connected);
      if (connectedPlayers.length < 2) {
        socket.emit('error', { 
          message: 'Need at least 2 players to start the game', 
          type: 'not_enough_players' 
        });
        return;
      }
      
      if (room.gameStarted) {
        socket.emit('error', { 
          message: 'Game has already started', 
          type: 'game_already_started' 
        });
        return;
      }
      
      room.gameStarted = true;
      
      io.to(roomCode).emit('gameStarted', { 
        players: connectedPlayers,
        roomCode 
      });
      
      console.log(`Game started in room ${roomCode} with ${connectedPlayers.length} players`);
      
    } catch (error) {
      console.error('Error starting game:', error);
      socket.emit('error', { 
        message: 'Failed to start game', 
        type: 'server_error' 
      });
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    try {
      console.log(`User disconnected: ${socket.id}`);
      
      pendingRequests.delete(socket.id);
      
      const { room, disconnectedPlayer } = handlePlayerDisconnection(socket.id);
      
      if (room && disconnectedPlayer) {
        const connectedPlayers = room.players.filter(p => p.connected);
        if (connectedPlayers.length > 0) {
          socket.to(room.roomCode).emit('playerDisconnected', { 
            players: connectedPlayers,
            disconnectedPlayer 
          });
        }
        
        console.log(`${disconnectedPlayer} disconnected from room ${room.roomCode} (${connectedPlayers.length} players remaining)`);
      }
      
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    activeRooms: rooms.size,
    timestamp: new Date().toISOString()
  });
});

// Get room info endpoint
app.get('/room/:roomCode', (req, res) => {
  const { roomCode } = req.params;
  const room = rooms.get(roomCode.toUpperCase());
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  res.json({
    roomCode: room.roomCode,
    playerCount: room.players.filter(p => p.connected).length,
    totalPlayers: room.players.length,
    maxPlayers: room.maxPlayers,
    gameStarted: room.gameStarted,
    createdAt: room.createdAt,
    isEmpty: room.emptyAt ? true : false,
    players: room.players.map(p => ({ 
      username: p.username, 
      isHost: p.isHost, 
      connected: p.connected,
      lastSeen: p.lastSeen
    }))
  });
});

// Start room cleanup
startRoomCleanup();

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Scrabble server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

export { app, server, io };