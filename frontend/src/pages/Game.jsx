
import React, { useState, useEffect, useRef } from 'react';
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

const Game = ({ socket, roomCode, currentPlayer, players, isHost }) => {
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

  // Initialize game
  useEffect(() => {
    if (socket && !gameStarted) {
      socket.on('gameStarted', handleGameStarted);
      socket.on('gameState', handleGameState);
      socket.on('turnChanged', handleTurnChanged);
      socket.on('moveSubmitted', handleMoveSubmitted);
      socket.on('tilesDrawn', handleTilesDrawn);
      socket.on('gameMessage', (data) => setMessage(data.message));

      return () => {
        socket.off('gameStarted');
        socket.off('gameState');
        socket.off('turnChanged');
        socket.off('moveSubmitted');
        socket.off('tilesDrawn');
        socket.off('gameMessage');
      };
    }
  }, [socket, gameStarted]);

  // Initialize tile bag
  const createTileBag = () => {
    const bag = [];
    Object.entries(TILE_DISTRIBUTION).forEach(([letter, data]) => {
      for (let i = 0; i < data.count; i++) {
        bag.push({ letter, value: data.value, id: Math.random().toString(36) });
      }
    });
    return shuffleArray(bag);
  };

  const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const handleGameStarted = (data) => {
    setGameStarted(true);
    setTileBag(data.tileBag);
    setPlayerRack(data.playerRacks[currentPlayer.id] || []);
    setScores(data.scores || {});
    setCurrentTurn(data.currentTurn || 0);
    setMessage('Game started! Place tiles to form words.');
  };

  const handleGameState = (data) => {
    setBoard(data.board);
    setScores(data.scores);
    setCurrentTurn(data.currentTurn);
    setPlayerRack(data.playerRacks[currentPlayer.id] || []);
  };

  const handleTurnChanged = (data) => {
    setCurrentTurn(data.currentTurn);
    setMessage(data.message);
  };

  const handleMoveSubmitted = (data) => {
    setBoard(data.board);
    setScores(data.scores);
    setPlacedTiles([]);
    setSelectedTile(null);
  };

  const handleTilesDrawn = (data) => {
    if (data.playerId === currentPlayer.id) {
      setPlayerRack(data.tiles);
    }
  };

  const startGame = () => {
    if (isHost && socket) {
      socket.emit('startGame', { roomCode });
    }
  };

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

  const handleCellClick = (row, col) => {
    if (!isCurrentPlayerTurn() || board[row][col]) return;

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

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, row, col) => {
    e.preventDefault();
    if (draggedTile && !board[row][col]) {
      placeTile(row, col, draggedTile);
      setDraggedTile(null);
    }
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
    if (placedTiles.length === 0) return;

    socket.emit('submitMove', {
      roomCode,
      placedTiles,
      board: board
    });
  };

  const passTurn = () => {
    socket.emit('passTurn', { roomCode });
    setPlacedTiles([]);
    setSelectedTile(null);
  };

  const exchangeTilesAction = () => {
    if (exchangeTiles.length === 0) return;

    socket.emit('exchangeTiles', {
      roomCode,
      tilesToExchange: exchangeTiles
    });

    setShowExchange(false);
    setExchangeTiles([]);
  };

  const isCurrentPlayerTurn = () => {
    return players[currentTurn]?.id === currentPlayer.id;
  };

  const getCurrentPlayerName = () => {
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

  if (!gameStarted) {
    return (
      <div className="game-container">
        <div className="game-waiting">
          <div className="neon-box">
            <h2>🎮 RETRO SCRABBLE</h2>
            <div className="player-list">
              {players.map((player, index) => (
                <div key={player.id} className="player-item">
                  <span className={player.isHost ? 'host-badge' : ''}>{player.username}</span>
                  {player.isHost && <span className="crown">👑</span>}
                </div>
              ))}
            </div>
            {isHost ? (
              <button className="start-btn neon-btn" onClick={startGame}>
                START GAME
              </button>
            ) : (
              <p className="waiting-message">Waiting for host to start the game...</p>
            )}
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
        </div>
      </div>

      {/* Score Panel */}
      <div className="score-panel">
        {players.map((player, index) => (
          <div 
            key={player.id} 
            className={`score-item ${index === currentTurn ? 'active-player' : ''}`}
          >
            <span className="player-name">{player.username}</span>
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
            
            return (
              <div
                key={`${rowIndex}-${colIndex}`}
                className={`board-cell ${premiumType ? `premium-${premiumType.toLowerCase()}` : ''} ${isCenter ? 'center-star' : ''}`}
                onClick={() => handleCellClick(rowIndex, colIndex)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, rowIndex, colIndex)}
              >
                {cell ? (
                  <div className="placed-tile">
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
        <div className="rack-label">YOUR TILES</div>
        <div className="tile-rack">
          {playerRack.map((tile, index) => (
            <div
              key={`${tile.id}-${index}`}
              className={`rack-tile ${selectedTile?.id === tile.id ? 'selected' : ''}`}
              draggable={isCurrentPlayerTurn()}
              onClick={() => handleTileClick(tile, index)}
              onDragStart={(e) => handleDragStart(e, tile, index)}
            >
              <span className="tile-letter">{tile.letter === 'BLANK' ? '?' : tile.letter}</span>
              <span className="tile-value">{tile.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Game Actions */}
      <div className="game-actions">
        {isCurrentPlayerTurn() && (
          <>
            <button 
              className="action-btn recall-btn" 
              onClick={recallTiles}
              disabled={placedTiles.length === 0}
            >
              RECALL
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
            >
              EXCHANGE
            </button>
          </>
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