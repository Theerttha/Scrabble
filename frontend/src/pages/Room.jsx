import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import '../styles/room.css';

const Room = () => {
  const [gameState, setGameState] = useState('menu'); // menu, creating, joining, waiting, pending_approval, in_room
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [generatedRoomCode, setGeneratedRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState([]);
  const [pendingPlayer, setPendingPlayer] = useState(null);
  const [notification, setNotification] = useState('');
  const [notificationType, setNotificationType] = useState('info'); // info, success, error
  const socketRef = useRef(null);
  const navigate = useNavigate();
  const { joinCode } = useParams();
  
  const backend_url = import.meta.env.VITE_URL || 'http://localhost:3000';
  console.log('Backend URL:', backend_url);

  // Create refs to hold current values
  const gameDataRef = useRef({
    generatedRoomCode: '',
    roomCode: '',
    players: [],
    isHost: false
  });

  // Update refs whenever state changes
  useEffect(() => {
    gameDataRef.current = {
      generatedRoomCode,
      roomCode,
      players,
      isHost
    };
  }, [generatedRoomCode, roomCode, players, isHost]);

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io(backend_url, { 
      transports: ["websocket"],
      autoConnect: true
    });

    const socket = socketRef.current;

    // Socket event listeners
    socket.on('connect', () => {
      console.log('Connected to server:', socket.id);
    });

    socket.on('roomCreated', (data) => {
      console.log('Room created:', data);
      setGeneratedRoomCode(data.roomCode);
      setGameState('waiting');
      setIsHost(true);
      setPlayers([{ username, id: socket.id, isHost: true }]);
      showNotification('Room created successfully! Share the link with your friend.', 'success');
    });

    socket.on('joinedRoom', (data) => {
      console.log('Joined room, waiting for approval:', data);
      setGameState('pending_approval');
      showNotification('Waiting for host approval...', 'info');
    });

    socket.on('playerJoinRequest', (data) => {
      console.log('Player join request:', data);
      // Use current gameDataRef values
      if (gameDataRef.current.isHost || gameState === 'waiting') {
        setPendingPlayer(data.player);
        showNotification(`${data.player.username} wants to join the game`, 'info');
      }
    });

    socket.on('joinApproved', (data) => {
      console.log('Join approved:', data);
      setGameState('in_room');
      setPlayers(data.players);
      showNotification('You have been accepted into the room!', 'success');
    });

    socket.on('joinDeclined', () => {
      setGameState('menu');
      showNotification('Your join request was declined', 'error');
      resetForm();
    });

    socket.on('playerApproved', (data) => {
      console.log('Player approved:', data);
      setPlayers(data.players);
      setPendingPlayer(null);
      setGameState('in_room');
      showNotification(`${data.newPlayer.username} joined the game!`, 'success');
    });

    socket.on('gameStarted', (data) => {
      console.log('Game started event received:', data);
      showNotification('Game starting...', 'success');
      
      // Use current values from ref instead of stale closure values
      const currentData = gameDataRef.current;
      
      // Prepare game data (WITHOUT socket)
      const gameData = {
        roomCode: currentData.generatedRoomCode || currentData.roomCode,
        players: currentData.players,
        isHost: currentData.isHost,
        currentPlayer: currentData.players.find(p => p.id === socket.id),
        gameState: data.gameState,
        playerRacks: data.playerRacks,
        tileBagCount: data.tileBag,
        // Don't include socket here!
      };
      
      console.log('Navigating to game with data:', gameData);
      console.log('Current ref data:', currentData);
      
      setTimeout(() => {
        navigate('/game', { 
          state: gameData
        });
      }, 2000);
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
      showNotification(error.message, 'error');
      if (error.type === 'username_taken' || error.type === 'room_not_found') {
        setGameState('menu');
        resetForm();
      }
    });

    socket.on('playerDisconnected', (data) => {
      setPlayers(data.players);
      showNotification(`${data.disconnectedPlayer} left the game`, 'info');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      //showNotification('Disconnected from server', 'error');
    });

    // Check if there's a join code in the URL
    if (joinCode) {
      setRoomCode(joinCode);
      setGameState('joining');
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [joinCode, navigate, username]); // Added username to dependencies

  const showNotification = (message, type = 'info') => {
    setNotification(message);
    setNotificationType(type);
    setTimeout(() => setNotification(''), 5000);
  };

  const resetForm = () => {
    setUsername('');
    setRoomCode('');
    setGeneratedRoomCode('');
    setPlayers([]);
    setPendingPlayer(null);
    setIsHost(false);
  };

  const handleCreateRoom = () => {
    setGameState('creating');
  };

  const handleJoinRoom = () => {
    setGameState('joining');
  };

  const handleBackToMenu = () => {
    setGameState('menu');
    resetForm();
    // Clear URL if there was a join code
    if (joinCode) {
      navigate('/', { replace: true });
    }
  };

  const handleGenerateRoom = () => {
    if (!username.trim()) {
      showNotification('Please enter a username', 'error');
      return;
    }
    
    if (!socketRef.current) {
      showNotification('Not connected to server', 'error');
      return;
    }
    
    console.log('Creating room with username:', username.trim());
    socketRef.current.emit('createRoom', { username: username.trim() });
  };

  const handleJoinRoomSubmit = () => {
    if (!username.trim() || !roomCode.trim()) {
      showNotification('Please enter both username and room code', 'error');
      return;
    }

    if (!socketRef.current) {
      showNotification('Not connected to server', 'error');
      return;
    }

    console.log('Joining room:', roomCode.trim(), 'with username:', username.trim());
    socketRef.current.emit('joinRoom', { 
      username: username.trim(), 
      roomCode: roomCode.trim() 
    });
  };

  const handleApprovePlayer = () => {
    if (pendingPlayer && socketRef.current) {
      console.log('Approving player:', pendingPlayer);
      socketRef.current.emit('approvePlayer', { 
        playerSocketId: pendingPlayer.id 
      });
    }
  };

  const handleDeclinePlayer = () => {
    if (pendingPlayer && socketRef.current) {
      console.log('Declining player:', pendingPlayer);
      socketRef.current.emit('declinePlayer', { 
        playerSocketId: pendingPlayer.id 
      });
      setPendingPlayer(null);
    }
  };

  const handleStartGame = () => {
    if (players.length >= 2) {
      if (socketRef.current) {
        const currentRoomCode = generatedRoomCode || roomCode;
        console.log('Starting game with roomCode:', currentRoomCode);
        console.log('Current players:', players);
        socketRef.current.emit('startGame');
      }
    } else {
      showNotification('Need at least 2 players to start the game', 'error');
    }
  };

  const copyRoomLink = () => {
    const roomLink = `${window.location.origin}/join/${generatedRoomCode}`;
    navigator.clipboard.writeText(roomLink).then(() => {
      showNotification('Room link copied to clipboard!', 'success');
    });
  };

  const getRoomLink = () => {
    return `${window.location.origin}/join/${generatedRoomCode}`;
  };

  return (
    <div className="room-container">
      <div className="retro-bg"></div>
      
      {/* Notification */}
      {notification && (
        <div className={`notification ${notificationType}`}>
          {notification}
        </div>
      )}

      <div className="room-content">
        <h1 className="game-title">
          <span className="neon-text">SCRABBLE</span>
          <span className="sub-title">Retro Edition</span>
        </h1>

        {gameState === 'menu' && (
          <div className="menu-section">
            <div className="button-grid">
              <button className="retro-button primary" onClick={handleCreateRoom}>
                <span>CREATE ROOM</span>
              </button>
              <button className="retro-button secondary" onClick={handleJoinRoom}>
                <span>JOIN ROOM</span>
              </button>
            </div>
          </div>
        )}

        {gameState === 'creating' && (
          <div className="form-section">
            <h2 className="section-title">Create New Room</h2>
            <div className="input-group">
              <label htmlFor="username" className="input-label">Enter Your Username</label>
              <input
                type="text"
                id="username"
                className="retro-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Player Name"
                maxLength="20"
                onKeyPress={(e) => e.key === 'Enter' && handleGenerateRoom()}
              />
            </div>
            <div className="button-group">
              <button className="retro-button primary" onClick={handleGenerateRoom}>
                GENERATE ROOM
              </button>
              <button className="retro-button tertiary" onClick={handleBackToMenu}>
                BACK
              </button>
            </div>
          </div>
        )}

        {gameState === 'joining' && (
          <div className="form-section">
            <h2 className="section-title">Join Existing Room</h2>
            <div className="input-group">
              <label htmlFor="join-username" className="input-label">Enter Your Username</label>
              <input
                type="text"
                id="join-username"
                className="retro-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Player Name"
                maxLength="20"
              />
            </div>
            <div className="input-group">
              <label htmlFor="room-code" className="input-label">Room Code</label>
              <input
                type="text"
                id="room-code"
                className="retro-input"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder="Enter room code"
                onKeyPress={(e) => e.key === 'Enter' && handleJoinRoomSubmit()}
              />
            </div>
            <div className="button-group">
              <button className="retro-button primary" onClick={handleJoinRoomSubmit}>
                JOIN ROOM
              </button>
              <button className="retro-button tertiary" onClick={handleBackToMenu}>
                BACK
              </button>
            </div>
          </div>
        )}

        {gameState === 'waiting' && (
          <div className="waiting-section">
            <h2 className="section-title">Room Created!</h2>
            <div className="room-info">
              <div className="room-code-display">
                <span className="room-code-label">Room Code:</span>
                <span className="room-code">{generatedRoomCode}</span>
              </div>
              <div className="room-link">
                <input
                  type="text"
                  className="retro-input link-input"
                  value={getRoomLink()}
                  readOnly
                />
                <button className="retro-button secondary copy-btn" onClick={copyRoomLink}>
                  COPY LINK
                </button>
              </div>
            </div>
            <div className="players-list">
              <h3>Players ({players.length}/4)</h3>
              {players.map((player, index) => (
                <div key={player.id} className="player-item">
                  <span>{player.username}</span>
                  {player.isHost && <span className="host-badge">HOST</span>}
                </div>
              ))}
            </div>
            
            {pendingPlayer && (
              <div className="approval-section">
                <h3>Join Request</h3>
                <p>{pendingPlayer.username} wants to join the game</p>
                <div className="button-group">
                  <button className="retro-button primary" onClick={handleApprovePlayer}>
                    ACCEPT
                  </button>
                  <button className="retro-button danger" onClick={handleDeclinePlayer}>
                    DECLINE
                  </button>
                </div>
              </div>
            )}
            
            <p className="waiting-text">Waiting for players to join...</p>
          </div>
        )}

        {gameState === 'pending_approval' && (
          <div className="pending-section">
            <h2 className="section-title">Requesting to Join</h2>
            <div className="loading-spinner"></div>
            <p>Waiting for host approval...</p>
            <button className="retro-button tertiary" onClick={handleBackToMenu}>
              CANCEL
            </button>
          </div>
        )}

        {gameState === 'in_room' && (
          <div className="room-ready-section">
            <h2 className="section-title">Room Ready!</h2>
            <div className="players-list">
              <h3>Players ({players.length}/4)</h3>
              {players.map((player, index) => (
                <div key={player.id} className="player-item">
                  <span>{player.username}</span>
  
                </div>
              ))}
            </div>
            
            {pendingPlayer && isHost && (
              <div className="approval-section">
                <h3>Join Request</h3>
                <p>{pendingPlayer.username} wants to join the game</p>
                <div className="button-group">
                  <button className="retro-button primary" onClick={handleApprovePlayer}>
                    ACCEPT
                  </button>
                  <button className="retro-button danger" onClick={handleDeclinePlayer}>
                    DECLINE
                  </button>
                </div>
              </div>
            )}

            {isHost && players.length >= 2 && (
              <button className="retro-button primary start-game-btn" onClick={handleStartGame}>
                START GAME
              </button>
            )}
            
            {!isHost && (
              <p className="waiting-text">Waiting for host to start the game...</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Room;