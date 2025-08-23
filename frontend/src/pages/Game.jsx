import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './game.css';

const SOCKET_URL = 'http://localhost:3001';

const ScrabbleGame = () => {
  const [socket, setSocket] = useState(null);
  const [gameState, setGameState] = useState('menu'); // menu, lobby, game
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [board, setBoard] = useState(Array(15).fill(null).map(() => Array(15).fill(null)));
  const [myTiles, setMyTiles] = useState([]);
  const [selectedTiles, setSelectedTiles] = useState([]);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [score, setScore] = useState(0);
  const [tilesRemaining, setTilesRemaining] = useState(98);
  const [error, setError] = useState('');
  const [isHost, setIsHost] = useState(false);
  const socketRef = useRef();

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);
    socketRef.current = newSocket;

    // Socket event listeners
    newSocket.on('roomCreated', (data) => {
      setRoom(data.room);
      setPlayers([data.player]);
      setIsHost(true);
      setGameState('lobby');
      setError('');
    });

    newSocket.on('joinedRoom', (data) => {
      setRoom(data.room);
      setPlayers(data.room.players);
      setGameState('lobby');
      setError('');
    });

    newSocket.on('playerJoined', (data) => {
      setPlayers(data.players);
    });

    newSocket.on('gameStarted', (data) => {
      setPlayers(data.players);
      setCurrentPlayer(data.currentPlayer);
      setBoard(data.board);
      setMyTiles(data.yourTiles);
      setTilesRemaining(data.tilesRemaining);
      setIsMyTurn(data.currentPlayer.socketId === newSocket.id);
      setGameState('game');
      setError('');
    });

    newSocket.on('moveMade', (data) => {
      setBoard(data.board);
      setPlayers(data.players);
      setCurrentPlayer(data.currentPlayer);
      setMyTiles(data.yourTiles);
      setTilesRemaining(data.tilesRemaining);
      setIsMyTurn(data.currentPlayer.socketId === newSocket.id);
      setSelectedTiles([]);
      
      // Update score for current player
      const myPlayer = data.players.find(p => p.socketId === newSocket.id);
      if (myPlayer) {
        setScore(myPlayer.score);
      }
    });

    newSocket.on('turnSkipped', (data) => {
      setCurrentPlayer(data.currentPlayer);
      setPlayers(data.players);
      setIsMyTurn(data.currentPlayer.socketId === newSocket.id);
    });

    newSocket.on('playerDisconnected', (data) => {
      setPlayers(data.connectedPlayers);
    });

    newSocket.on('error', (error) => {
      setError(error.message);
    });

    return () => newSocket.close();
  }, []);

  const createRoom = () => {
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }
    socket.emit('createRoom', { username: username.trim() });
  };

  const joinRoom = () => {
    if (!username.trim() || !roomCode.trim()) {
      setError('Please enter username and room code');
      return;
    }
    socket.emit('joinRoom', { 
      username: username.trim(), 
      roomCode: roomCode.trim().toUpperCase() 
    });
  };

  const startGame = () => {
    socket.emit('startGame');
  };

  const skipTurn = () => {
    socket.emit('skipTurn');
  };

  const selectTile = (index) => {
    if (!isMyTurn) return;
    
    const tile = myTiles[index];
    if (selectedTiles.includes(index)) {
      setSelectedTiles(selectedTiles.filter(i => i !== index));
    } else {
      setSelectedTiles([...selectedTiles, index]);
    }
  };

  const renderMenu = () => (
    <div className="menu-container">
      <div className="menu-card">
        <h1 className="game-title">
          <span className="title-letter s">S</span>
          <span className="title-letter c">C</span>
          <span className="title-letter r">R</span>
          <span className="title-letter a">A</span>
          <span className="title-letter b">B</span>
          <span className="title-letter b2">B</span>
          <span className="title-letter l">L</span>
          <span className="title-letter e">E</span>
        </h1>
        
        <div className="input-group">
          <input
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="username-input"
            maxLength={20}
          />
        </div>

        <div className="menu-buttons">
          <button onClick={createRoom} className="btn btn-primary">
            Create Room
          </button>
          
          <div className="join-room-section">
            <input
              type="text"
              placeholder="Room Code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              className="room-code-input"
              maxLength={6}
            />
            <button onClick={joinRoom} className="btn btn-secondary">
              Join Room
            </button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}
      </div>
    </div>
  );

  const renderLobby = () => (
    <div className="lobby-container">
      <div className="lobby-card">
        <h2 className="lobby-title">Room: {room?.roomCode}</h2>
        
        <div className="players-section">
          <h3>Players ({players.length}/{room?.maxPlayers})</h3>
          <div className="players-list">
            {players.map((player, index) => (
              <div key={player.id} className="player-item">
                <span className="player-name">
                  {player.username}
                  {player.isHost && <span className="host-badge">HOST</span>}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="lobby-actions">
          {isHost && (
            <button 
              onClick={startGame} 
              className="btn btn-primary"
              disabled={players.length < 2}
            >
              Start Game
            </button>
          )}
          
          {!isHost && (
            <div className="waiting-message">
              Waiting for host to start the game...
            </div>
          )}
        </div>

        {error && <div className="error-message">{error}</div>}
      </div>
    </div>
  );

  const renderBoard = () => (
    <div className="board-container">
      <div className="game-board">
        {board.map((row, rowIndex) => 
          row.map((cell, colIndex) => (
            <div 
              key={`${rowIndex}-${colIndex}`} 
              className={`board-cell ${cell ? 'has-tile' : ''}`}
            >
              {cell && <div className="board-tile">{cell}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderGame = () => (
    <div className="game-container">
      <div className="game-header">
        <div className="game-info">
          <div className="current-player">
            Current Turn: <span className="player-highlight">
              {currentPlayer?.username}
              {isMyTurn && " (Your Turn)"}
            </span>
          </div>
          <div className="tiles-remaining">
            Tiles Remaining: {tilesRemaining}
          </div>
        </div>
        
        <div className="players-scores">
          {players.map(player => (
            <div key={player.id} className="player-score">
              <span className="player-name">{player.username}</span>
              <span className="score">{player.score}</span>
            </div>
          ))}
        </div>
      </div>

      {renderBoard()}

      <div className="game-controls">
        <div className="player-tiles">
          <h3>Your Tiles</h3>
          <div className="tiles-rack">
            {myTiles.map((tile, index) => (
              <div 
                key={index}
                className={`player-tile ${selectedTiles.includes(index) ? 'selected' : ''}`}
                onClick={() => selectTile(index)}
              >
                {tile}
              </div>
            ))}
          </div>
        </div>

        <div className="game-actions">
          {isMyTurn && (
            <>
              <button className="btn btn-primary" disabled={selectedTiles.length === 0}>
                Play Word
              </button>
              <button onClick={skipTurn} className="btn btn-secondary">
                Skip Turn
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
    </div>
  );

  return (
    <div className="scrabble-app">
      {gameState === 'menu' && renderMenu()}
      {gameState === 'lobby' && renderLobby()}
      {gameState === 'game' && renderGame()}
    </div>
  );
};

export default ScrabbleGame;