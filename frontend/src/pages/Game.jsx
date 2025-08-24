import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import '../styles/game.css';

const BOARD_SIZE = 15;
const RACK_SIZE = 7;

// Tile distribution and values
const TILE_DISTRIBUTION = {
  'A': { count: 9, value: 1 }, 'B': { count: 2, value: 3 }, 'C': { count: 2, value: 3 },
  'D': { count: 4, value: 2 }, 'E': { count: 12, value: 1 }, 'F': { count: 2, value: 4 },
  'G': { count: 3, value: 2 }, 'H': { count: 2, value: 4 }, 'I': { count: 9, value: 1 },
  'J': { count: 1, value: 8 }, 'K': { count: 1, value: 5 }, 'L': { count: 4, value: 1 },
  'M': { count: 2, value: 3 }, 'N': { count: 6, value: 1 }, 'O': { count: 8, value: 1 },
  'P': { count: 2, value: 3 }, 'Q': { count: 1, value: 10 }, 'R': { count: 6, value: 1 },
  'S': { count: 4, value: 1 }, 'T': { count: 6, value: 1 }, 'U': { count: 4, value: 1 },
  'V': { count: 2, value: 4 }, 'W': { count: 2, value: 4 }, 'X': { count: 1, value: 8 },
  'Y': { count: 2, value: 4 }, 'Z': { count: 1, value: 10 }, 'BLANK': { count: 2, value: 0 }
};

// Premium squares
const PREMIUM_SQUARES = {
  'DW': [[1,1],[2,2],[3,3],[4,4],[7,7],[10,10],[11,11],[12,12],[13,13]],
  'TW': [[0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]],
  'DL': [[0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],[6,2],[6,6],[6,8],[6,12],[7,3],[7,11],[8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],[12,6],[12,8],[14,3],[14,11]],
  'TL': [[1,5],[1,9],[5,1],[5,5],[5,9],[5,13],[9,1],[9,5],[9,9],[9,13],[13,5],[13,9]]
};

const Game = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [board, setBoard] = useState(() => Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(null)));
  const [playerRack, setPlayerRack] = useState([]);
  const [selectedTile, setSelectedTile] = useState(null);
  const [placedTiles, setPlacedTiles] = useState([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [scores, setScores] = useState({});
  const [gameStarted, setGameStarted] = useState(false);
  const [tileBag, setTileBag] = useState([]);
  const [draggedTile, setDraggedTile] = useState(null);
  const [showExchange, setShowExchange] = useState(false);
  const [exchangeTiles, setExchangeTiles] = useState([]);
  const [message, setMessage] = useState('');
  const boardRef = useRef(null);
  const socketRef = useRef(null);

  // Game data
  const [roomCode, setRoomCode] = useState('');
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [gameDataLoaded, setGameDataLoaded] = useState(false);
  const [socketReady, setSocketReady] = useState(false);

  const backend_url = import.meta.env.VITE_URL || 'http://localhost:3000';

  // Initialize game from location state
  useEffect(() => {
    console.log('Game component mounted, location.state:', location.state);
    
    if (!location.state || !location.state.roomCode) {
      console.error('No game data found, redirecting to home');
      navigate('/');
      return;
    }

    const gameData = location.state;
    console.log('Setting up game with data:', gameData);

    // Set game data
    setRoomCode(gameData.roomCode);
    setCurrentPlayer(gameData.currentPlayer);
    setPlayers(gameData.players || []);
    setIsHost(gameData.isHost || false);

    // Set initial game state if available
    if (gameData.gameState) {
      setBoard(gameData.gameState.board || Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(null)));
      setScores(gameData.gameState.scores || {});
      setCurrentTurn(gameData.gameState.currentTurn || 0);
    }

    // Set player rack if available
    if (gameData.playerRacks && gameData.currentPlayer) {
      console.log('Setting initial player rack:', gameData.playerRacks[gameData.currentPlayer.id]);
      setPlayerRack(gameData.playerRacks[gameData.currentPlayer.id] || []);
    }

    setGameDataLoaded(true);
    setMessage('Connecting to game...');

  }, [location.state, navigate]);

  // Initialize socket connection after game data is loaded
  useEffect(() => {
    if (!gameDataLoaded || !roomCode) return;

    console.log('Creating socket connection for room:', roomCode);
    
    // Create new socket connection
    const newSocket = io(backend_url, {
      transports: ["websocket"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000
    });

    socketRef.current = newSocket;

    // Set up basic connection handlers
    newSocket.on('connect', () => {
      console.log('Socket connected with ID:', newSocket.id);
      setIsConnected(true);
      
      // Update current player with new socket ID
      setCurrentPlayer(prev => ({
        ...prev,
        socketId: newSocket.id
      }));
      
      // Join the room with updated socket info
      console.log('Joining room with updated socket ID');
      newSocket.emit('updateSocketId', { 
        roomCode, 
        oldSocketId: currentPlayer?.socketId,
        newSocketId: newSocket.id,
        playerId: currentPlayer?.id 
      });
      
      setSocketReady(true);
      setMessage('Connected! Loading game...');
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
      setSocketReady(false);
      setMessage('Connection lost. Reconnecting...');
    });

    newSocket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setMessage('Connection failed. Retrying...');
    });

    return () => {
      if (socketRef.current) {
        console.log('Cleaning up socket connection');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [gameDataLoaded, roomCode, backend_url]);

  // Initialize socket listeners after socket is ready
  useEffect(() => {
    if (!socketRef.current || !socketReady || !roomCode || !currentPlayer) return;

    const socket = socketRef.current;
    console.log('Setting up socket listeners for game');

    const handleSocketUpdated = () => {
      console.log('Socket ID updated successfully, requesting game state');
      socket.emit('getGameState', { roomCode });
      setGameStarted(true);
      setMessage('Game loaded! Place tiles to form words.');
    };

    const handleGameState = (data) => {
      console.log('Received game state:', data);
      
      // FIXED: Always update board state for all players
      if (data.board) {
        console.log('Updating board from game state');
        setBoard(data.board);
      }
      
      if (data.scores) setScores(data.scores);
      if (typeof data.currentTurn === 'number') setCurrentTurn(data.currentTurn);
      
      if (data.players) {
        setPlayers(data.players);
        // Update current player info
        const updatedPlayer = data.players.find(p => p.id === currentPlayer.id);
        if (updatedPlayer) {
          setCurrentPlayer(updatedPlayer);
        }
      }
      
      // FIXED: Ensure player rack is updated for the requesting player
      if (data.playerRacks && currentPlayer) {
        console.log('Updating player rack from game state:', data.playerRacks[currentPlayer.id]);
        setPlayerRack(data.playerRacks[currentPlayer.id] || []);
      }
      
      setMessage('Game synchronized successfully!');
    };

    const handleTurnChanged = (data) => {
      console.log('Turn changed:', data);
      setCurrentTurn(data.currentTurn);
      setMessage(data.message);
    };

    const handleMoveSubmitted = (data) => {
      console.log('Move submitted:', data);
      if (data.board) setBoard(data.board);
      if (data.scores) setScores(data.scores);
      setPlacedTiles([]);
      setSelectedTile(null);
    };

    const handleTilesDrawn = (data) => {
      console.log('Tiles drawn event:', data);
      if (currentPlayer && data.playerId === currentPlayer.id) {
        console.log('Updating player rack with new tiles:', data.tiles);
        setPlayerRack(data.tiles);
      }
    };

    const handleGameMessage = (data) => {
      console.log('Game message:', data);
      setMessage(data.message);
    };

    const handleGameEnded = (data) => {
      console.log('Game ended:', data);
      setMessage(`Game Over! Winner: ${data.winner}`);
    };

    const handleError = (error) => {
      console.error('Game error:', error);
      setMessage(`Error: ${error.message}`);
      
      // If player not found, try to update socket ID again
      if (error.message === 'Player not found') {
        console.log('Player not found, updating socket ID again');
        socket.emit('updateSocketId', { 
          roomCode, 
          oldSocketId: currentPlayer?.socketId,
          newSocketId: socket.id,
          playerId: currentPlayer?.id 
        });
      }
    };

    // Attach listeners
    socket.on('socketUpdated', handleSocketUpdated);
    socket.on('gameState', handleGameState);
    socket.on('turnChanged', handleTurnChanged);
    socket.on('moveSubmitted', handleMoveSubmitted);
    socket.on('tilesDrawn', handleTilesDrawn);
    socket.on('gameMessage', handleGameMessage);
    socket.on('gameEnded', handleGameEnded);
    socket.on('error', handleError);

    return () => {
      socket.off('socketUpdated', handleSocketUpdated);
      socket.off('gameState', handleGameState);
      socket.off('turnChanged', handleTurnChanged);
      socket.off('moveSubmitted', handleMoveSubmitted);
      socket.off('tilesDrawn', handleTilesDrawn);
      socket.off('gameMessage', handleGameMessage);
      socket.off('gameEnded', handleGameEnded);
      socket.off('error', handleError);
    };
  }, [socketReady, roomCode, currentPlayer]);

  const getPremiumType = (row, col) => {
    for (const [type, positions] of Object.entries(PREMIUM_SQUARES)) {
      if (positions.some(([r, c]) => r === row && c === col)) {
        return type;
      }
    }
    return null;
  };

  const getPremiumLabel = (type) => {
    switch (type) {
      case 'DW': return '2W';
      case 'TW': return '3W';
      case 'DL': return '2L';
      case 'TL': return '3L';
      default: return '';
    }
  };

  // FIXED: Check if tile is from current turn (can be moved)
  const isTileMoveable = (row, col) => {
    return placedTiles.some(placed => placed.row === row && placed.col === col);
  };

  // FIXED: Handle clicking on placed tiles to move them
  const handleCellClick = (row, col) => {
    if (!isCurrentPlayerTurn()) return;

    const cellTile = board[row][col];
    
    // If clicking on a moveable tile (placed this turn)
    if (cellTile && isTileMoveable(row, col)) {
      // Remove tile from board and add back to rack
      removeTileFromBoard(row, col);
      return;
    }

    // If cell is occupied by a permanent tile, can't place here
    if (cellTile) return;

    // Place selected tile if we have one
    if (selectedTile) {
      placeTile(row, col, selectedTile);
      setSelectedTile(null);
    }
  };

  const handleTileClick = (tile, index) => {
    if (!isCurrentPlayerTurn()) return;

    if (selectedTile?.id === tile.id) {
      setSelectedTile(null);
    } else {
      setSelectedTile({ ...tile, rackIndex: index });
    }
  };

  // FIXED: New function to remove tile from board and return to rack
  const removeTileFromBoard = (row, col) => {
    const placedTileInfo = placedTiles.find(placed => placed.row === row && placed.col === col);
    if (!placedTileInfo) return;

    // Remove from board
    const newBoard = board.map(boardRow => [...boardRow]);
    newBoard[row][col] = null;
    setBoard(newBoard);

    // Add back to rack
    const newRack = [...playerRack, placedTileInfo.tile];
    setPlayerRack(newRack);

    // Remove from placedTiles tracking
    setPlacedTiles(placedTiles.filter(placed => !(placed.row === row && placed.col === col)));
    
    console.log(`Removed tile ${placedTileInfo.tile.letter} from (${row}, ${col}) back to rack`);
  };

  const placeTile = (row, col, tile) => {
    const newBoard = board.map(row => [...row]);
    newBoard[row][col] = tile;
    setBoard(newBoard);

    const newRack = playerRack.filter((_, i) => i !== tile.rackIndex);
    setPlayerRack(newRack);

    setPlacedTiles([...placedTiles, { row, col, tile }]);
  };

  const handleDragStart = (e, tile, index) => {
    if (!isCurrentPlayerTurn()) {
      e.preventDefault();
      return;
    }
    setDraggedTile({ ...tile, rackIndex: index });
  };

  // FIXED: Enhanced drag start for board tiles
  const handleBoardTileDragStart = (e, row, col) => {
    if (!isCurrentPlayerTurn()) {
      e.preventDefault();
      return;
    }
    
    // Only allow dragging tiles placed this turn
    if (!isTileMoveable(row, col)) {
      e.preventDefault();
      return;
    }
    
    const tile = board[row][col];
    const placedTileInfo = placedTiles.find(placed => placed.row === row && placed.col === col);
    
    if (tile && placedTileInfo) {
      setDraggedTile({ 
        ...tile, 
        fromBoard: true, 
        originalRow: row, 
        originalCol: col,
        originalTileInfo: placedTileInfo
      });
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // FIXED: Enhanced drop handler for moving tiles
  const handleDrop = (e, row, col) => {
    e.preventDefault();
    if (!draggedTile) return;

    // Can't drop on occupied cell (except moving to same position)
    if (board[row][col] && !(draggedTile.fromBoard && draggedTile.originalRow === row && draggedTile.originalCol === col)) {
      setDraggedTile(null);
      return;
    }

    if (draggedTile.fromBoard) {
      // Moving tile from board to board
      const { originalRow, originalCol, originalTileInfo } = draggedTile;
      
      // If dropping on same position, do nothing
      if (originalRow === row && originalCol === col) {
        setDraggedTile(null);
        return;
      }
      
      // Remove from original position
      const newBoard = board.map(boardRow => [...boardRow]);
      newBoard[originalRow][originalCol] = null;
      newBoard[row][col] = draggedTile;
      setBoard(newBoard);
      
      // Update placed tiles tracking
      const newPlacedTiles = placedTiles.map(placed => {
        if (placed.row === originalRow && placed.col === originalCol) {
          return { ...placed, row, col };
        }
        return placed;
      });
      setPlacedTiles(newPlacedTiles);
      
    } else {
      // Moving tile from rack to board
      if (!board[row][col]) {
        placeTile(row, col, draggedTile);
      }
    }
    
    setDraggedTile(null);
  };

  const recallTiles = () => {
    const newBoard = board.map(row => [...row]);
    const newRack = [...playerRack];

    placedTiles.forEach(({ row, col, tile }) => {
      newBoard[row][col] = null;
      newRack.push(tile);
    });

    setBoard(newBoard);
    setPlayerRack(newRack);
    setPlacedTiles([]);
    setSelectedTile(null);
  };

  const submitMove = () => {
    if (placedTiles.length === 0) {
      setMessage('Please place at least one tile');
      return;
    }

    if (socketRef.current && isConnected) {
      console.log('Submitting move:', placedTiles);
      socketRef.current.emit('submitMove', {
        roomCode,
        placedTiles,
        board: board
      });
      setMessage('Submitting move...');
    } else {
      setMessage('Not connected to server');
    }
  };

  const passTurn = () => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('passTurn', { roomCode });
      setMessage('Passing turn...');
    } else {
      setMessage('Not connected to server');
    }
    setPlacedTiles([]);
    setSelectedTile(null);
  };

  const exchangeTilesAction = () => {
    if (exchangeTiles.length === 0) return;

    if (socketRef.current && isConnected) {
      socketRef.current.emit('exchangeTiles', {
        roomCode,
        tilesToExchange: exchangeTiles
      });
      setMessage(`Exchanging ${exchangeTiles.length} tiles...`);
    } else {
      setMessage('Not connected to server');
    }

    setShowExchange(false);
    setExchangeTiles([]);
  };

  const isCurrentPlayerTurn = () => {
    if (!players || !currentPlayer || !gameStarted) return false;
    const currentTurnPlayer = players[currentTurn];
    return currentTurnPlayer?.id === currentPlayer.id;
  };

  const getCurrentPlayerName = () => {
    if (!players || players.length === 0) return 'Unknown';
    return players[currentTurn]?.username || 'Unknown';
  };

  const toggleExchangeTile = (tile, index) => {
    const isSelected = exchangeTiles.some(t => t.rackIndex === index);
    if (isSelected) {
      setExchangeTiles(exchangeTiles.filter(t => t.rackIndex !== index));
    } else {
      setExchangeTiles([...exchangeTiles, { ...tile, rackIndex: index }]);
    }
  };

  // Loading state while game data is being set up
  if (!gameDataLoaded || !socketReady || !gameStarted || !players || players.length === 0 || !currentPlayer) {
    return (
      <div className="game-container">
        <div className="game-waiting">
          <div className="neon-box">
            <h2>🎮 RETRO SCRABBLE</h2>
            <p>
              {!gameDataLoaded ? 'Loading game data...' : 
               !isConnected ? 'Connecting to server...' :
               !socketReady ? 'Setting up connection...' :
               !gameStarted ? 'Loading game state...' :
               'Setting up game...'}
            </p>
            <div className="loading-spinner"></div>
            <div style={{marginTop: '10px', fontSize: '12px', color: '#888'}}>
              Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </div>
            <button className="start-btn neon-btn" onClick={() => navigate('/')}>
              BACK TO HOME
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-container">
      {/* Header */}
      <div className="game-header">
        <div className="game-title">🎮 RETRO SCRABBLE</div>
        <div className="turn-indicator">
          <span className="current-turn">
            {isCurrentPlayerTurn() ? "YOUR TURN" : `${getCurrentPlayerName()}'S TURN`}
          </span>
          <div className="connection-status">
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </div>
        </div>
      </div>

      {/* Score Panel */}
      <div className="score-panel">
        {players.map((player, index) => (
          <div 
            key={player.id} 
            className={`score-item ${index === currentTurn ? 'active-player' : ''} ${player.id === currentPlayer.id ? 'current-user' : ''}`}
          >
            <span className="player-name">
              {player.username}
              {player.id === currentPlayer.id && ' (You)'}
            </span>
            <span className="score">{scores[player.id] || 0}</span>
          </div>
        ))}
      </div>

      {/* Message */}
      {message && (
        <div className="game-message">
          {message}
        </div>
      )}

      {/* Game Board */}
      <div className="game-board" ref={boardRef}>
        {board.map((row, rowIndex) =>
          row.map((cell, colIndex) => {
            const premiumType = getPremiumType(rowIndex, colIndex);
            const isCenter = rowIndex === 7 && colIndex === 7;
            const isMoveable = cell && isTileMoveable(rowIndex, colIndex);
            
            return (
              <div
                key={`${rowIndex}-${colIndex}`}
                className={`board-cell ${premiumType ? `premium-${premiumType.toLowerCase()}` : ''} ${isCenter ? 'center-star' : ''} ${isCurrentPlayerTurn() ? 'clickable' : ''} ${isMoveable ? 'moveable-tile' : ''}`}
                onClick={() => handleCellClick(rowIndex, colIndex)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, rowIndex, colIndex)}
              >
                {cell ? (
                  <div 
                    className={`placed-tile ${isMoveable ? 'current-turn-tile' : 'permanent-tile'}`}
                    draggable={isCurrentPlayerTurn() && isMoveable}
                    onDragStart={(e) => handleBoardTileDragStart(e, rowIndex, colIndex)}
                    title={isMoveable ? 'Click or drag to move this tile' : 'Permanent tile'}
                  >
                    <span className="tile-letter">{cell.letter}</span>
                    <span className="tile-value">{cell.value}</span>
                  </div>
                ) : (
                  <>
                    {premiumType && (
                      <span className="premium-label">
                        {getPremiumLabel(premiumType)}
                      </span>
                    )}
                    {isCenter && !premiumType && (
                      <span className="center-star">⭐</span>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Player Rack */}
      <div className="player-rack">
        <div className="rack-label">YOUR TILES ({playerRack.length})</div>
        <div className="tile-rack">
          {playerRack.length === 0 ? (
            <div className="empty-rack">No tiles available</div>
          ) : (
            playerRack.map((tile, index) => (
              <div
                key={`${tile.id}-${index}`}
                className={`rack-tile ${selectedTile?.id === tile.id ? 'selected' : ''} ${isCurrentPlayerTurn() ? 'interactive' : 'disabled'}`}
                draggable={isCurrentPlayerTurn()}
                onClick={() => handleTileClick(tile, index)}
                onDragStart={(e) => handleDragStart(e, tile, index)}
              >
                <span className="tile-letter">{tile.letter === 'BLANK' ? '?' : tile.letter}</span>
                <span className="tile-value">{tile.value}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Game Actions */}
      <div className="game-actions">
        {isCurrentPlayerTurn() && isConnected ? (
          <>
            <button 
              className="action-btn recall-btn" 
              onClick={recallTiles}
              disabled={placedTiles.length === 0}
            >
              RECALL ({placedTiles.length})
            </button>
            <button 
              className="action-btn submit-btn neon-btn" 
              onClick={submitMove}
              disabled={placedTiles.length === 0}
            >
              PLAY WORD
            </button>
            <button 
              className="action-btn pass-btn" 
              onClick={passTurn}
            >
              PASS
            </button>
            <button 
              className="action-btn exchange-btn" 
              onClick={() => setShowExchange(true)}
              disabled={playerRack.length === 0}
            >
              EXCHANGE
            </button>
          </>
        ) : (
          <div className="turn-info">
            {!isConnected ? 'Reconnecting...' : 
             !isCurrentPlayerTurn() ? `Waiting for ${getCurrentPlayerName()}...` : 
             'Loading...'}
          </div>
        )}
      </div>

      {/* Exchange Modal */}
      {showExchange && (
        <div className="modal-overlay">
          <div className="exchange-modal neon-box">
            <h3>EXCHANGE TILES</h3>
            <div className="exchange-rack">
              {playerRack.map((tile, index) => (
                <div
                  key={`exchange-${tile.id}-${index}`}
                  className={`rack-tile ${exchangeTiles.some(t => t.rackIndex === index) ? 'selected' : ''}`}
                  onClick={() => toggleExchangeTile(tile, index)}
                >
                  <span className="tile-letter">{tile.letter === 'BLANK' ? '?' : tile.letter}</span>
                  <span className="tile-value">{tile.value}</span>
                </div>
              ))}
            </div>
            <div className="exchange-actions">
              <button className="action-btn cancel-btn" onClick={() => {
                setShowExchange(false);
                setExchangeTiles([]);
              }}>
                CANCEL
              </button>
              <button 
                className="action-btn exchange-confirm-btn neon-btn" 
                onClick={exchangeTilesAction}
                disabled={exchangeTiles.length === 0}
              >
                EXCHANGE ({exchangeTiles.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Game;