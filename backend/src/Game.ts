import { Server, Socket } from "socket.io";
import { rooms, playerRooms, Player } from "./Room";

// --------------------
// Types
// --------------------
export interface Tile {
  letter: string;
  value: number;
  id: string;
}

export interface PlacedTile {
  row: number;
  col: number;
  tile: Tile;
}

export interface GameState {
  board: (Tile | null)[][];
  tileBag: Tile[];
  playerRacks: Record<string, Tile[]>;
  scores: Record<string, number>;
  currentTurn: number;
  players: Player[];
  passCount: number;
  gameEnded: boolean;
  wordsPlayed: WordPlayed[];
  firstWordPlayed: boolean;
}

export interface WordFormed {
  word: string;
  tiles: Tile[];
  positions: { row: number; col: number }[];
}

export interface WordPlayed {
  word: string;
  player: string;
  score: number;
  turn: number;
}

export interface TileDistribution {
  [key: string]: {
    count: number;
    value: number;
  };
}

export interface ExchangeTile {
  rackIndex: number;
}

// --------------------
// Game Constants
// --------------------
const BOARD_SIZE = 15;
const RACK_SIZE = 7;

// Tile distribution and values
const TILE_DISTRIBUTION: TileDistribution = {
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

// Premium squares positions
const PREMIUM_SQUARES: Record<string, number[][]> = {
  'DW': [[1,1],[2,2],[3,3],[4,4],[7,7],[10,10],[11,11],[12,12],[13,13]],
  'TW': [[0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]],
  'DL': [[0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],[6,2],[6,6],[6,8],[6,12],[7,3],[7,11],[8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],[12,6],[12,8],[14,3],[14,11]],
  'TL': [[1,5],[1,9],[5,1],[5,5],[5,9],[5,13],[9,1],[9,5],[9,9],[9,13],[13,5],[13,9]]
};

// --------------------
// Dictionary API Integration
// --------------------

// Cache for word validation to reduce API calls
const wordCache = new Map<string,any>();
const cacheExpiration = 24 * 60 * 60 * 1000; // 24 hours

interface WordCacheEntry {
  valid: boolean;
  timestamp: number;
}

async function validateWordWithAPI(word: string): Promise<boolean> {
  const upperWord = word.toUpperCase();
  
  // Check cache first
  const cached = wordCache.get(upperWord) as WordCacheEntry | undefined;
  if (cached && Date.now() - cached.timestamp < cacheExpiration) {
    return cached.valid;
  }

  try {
    // Using Free Dictionary API
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
    const isValid = response.ok;
    
    // Cache the result
    wordCache.set(upperWord, {
      valid: isValid,
      timestamp: Date.now()
    });
    
    return isValid;
  } catch (error) {
    console.error(`Error validating word "${word}":`, error);
    
    // Fallback: if API fails, check against basic word list
    const basicWords = new Set([
      'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 
      'HAD', 'BY', 'HOT', 'WORD', 'WHAT', 'SOME', 'WE', 'IT', 'OF', 'TO', 'IN', 'A', 'HAVE',
      'I', 'THAT', 'HE', 'AS', 'HIS', 'WITH', 'ON', 'BE', 'AT', 'THIS', 'HAVE', 'FROM',
      'OR', 'ONE', 'HAD', 'BY', 'WORDS', 'BUT', 'WHAT', 'SOME', 'IS', 'IT', 'YOU', 'OR',
      'HAD', 'THE', 'OF', 'TO', 'AND', 'A', 'IN', 'WE', 'CAN', 'OUT', 'OTHER', 'WERE',
      'WHICH', 'THEIR', 'SAID', 'EACH', 'SHE', 'DO', 'HOW', 'THEIR', 'IF', 'WILL', 'UP',
      'OTHER', 'ABOUT', 'OUT', 'MANY', 'THEN', 'THEM', 'THESE', 'SO', 'SOME', 'HER', 'WOULD',
      'MAKE', 'LIKE', 'INTO', 'HIM', 'TIME', 'HAS', 'TWO', 'MORE', 'VERY', 'WHAT', 'KNOW',
      'JUST', 'FIRST', 'GET', 'OVER', 'THINK', 'ALSO', 'YOUR', 'WORK', 'LIFE', 'ONLY',
      'NEW', 'YEARS', 'WAY', 'MAY', 'SAY', 'COME', 'ITS', 'MOST', 'DID', 'MY', 'SOUND',
      'NO', 'FIND', 'PEOPLE', 'OIL', 'SIT', 'SET', 'HAD'
    ]);
    
    const isValidFallback = basicWords.has(upperWord);
    wordCache.set(upperWord, {
      valid: isValidFallback,
      timestamp: Date.now()
    });
    
    return isValidFallback;
  }
}

// --------------------
// Game State
// --------------------
export const gameStates = new Map<string, GameState>(); // roomCode -> gameState

// --------------------
// Game Functions
// --------------------

function createTileBag(): Tile[] {
  const bag: Tile[] = [];
  Object.entries(TILE_DISTRIBUTION).forEach(([letter, data]) => {
    for (let i = 0; i < data.count; i++) {
      bag.push({ 
        letter, 
        value: data.value, 
        id: Math.random().toString(36).substr(2, 9)
      });
    }
  });
  return shuffleArray(bag);
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function drawTiles(tileBag: Tile[], count: number): Tile[] {
  return tileBag.splice(0, Math.min(count, tileBag.length));
}

function initializeGameState(roomCode: string, players: Player[]): GameState {
  const tileBag = createTileBag();
  const playerRacks: Record<string, Tile[]> = {};
  const scores: Record<string, number> = {};
  
  players.forEach(player => {
    playerRacks[player.id] = drawTiles(tileBag, RACK_SIZE);
    scores[player.id] = 0;
  });

  const gameState: GameState = {
    board: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null)),
    tileBag,
    playerRacks,
    scores,
    currentTurn: 0,
    players: players,
    passCount: 0,
    gameEnded: false,
    wordsPlayed: [],
    firstWordPlayed: false
  };

  gameStates.set(roomCode, gameState);
  return gameState;
}

function getPremiumType(row: number, col: number): string | null {
  for (const [type, positions] of Object.entries(PREMIUM_SQUARES)) {
    if (positions.some(([r, c]) => r === row && c === col)) {
      return type;
    }
  }
  return null;
}

function isValidWordPlacement(
  board: (Tile | null)[][], 
  placedTiles: PlacedTile[], 
  isFirstWord: boolean
): { valid: boolean; reason?: string } {
  if (placedTiles.length === 0) return { valid: false, reason: "No tiles placed" };
  
  // Check if tiles form a single word (either horizontal or vertical)
  const sortedTiles = [...placedTiles].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });

  const isHorizontal = sortedTiles.every(tile => tile.row === sortedTiles[0].row);
  const isVertical = sortedTiles.every(tile => tile.col === sortedTiles[0].col);

  if (!isHorizontal && !isVertical) {
    return { valid: false, reason: "Tiles must form a single word" };
  }

  // Check if tiles are consecutive
  if (isHorizontal) {
    for (let i = 1; i < sortedTiles.length; i++) {
      const expectedCol = sortedTiles[i-1].col + 1;
      if (sortedTiles[i].col > expectedCol) {
        // Check if there's an existing tile filling the gap
        const gapFilled = board[sortedTiles[i].row][expectedCol] !== null;
        if (!gapFilled) {
          return { valid: false, reason: "Tiles must be consecutive" };
        }
      }
    }
  } else {
    for (let i = 1; i < sortedTiles.length; i++) {
      const expectedRow = sortedTiles[i-1].row + 1;
      if (sortedTiles[i].row > expectedRow) {
        const gapFilled = board[expectedRow][sortedTiles[i].col] !== null;
        if (!gapFilled) {
          return { valid: false, reason: "Tiles must be consecutive" };
        }
      }
    }
  }

  // Check if first word covers center square
  if (isFirstWord) {
    const coversCenter = placedTiles.some(tile => tile.row === 7 && tile.col === 7) ||
                        board[7][7] !== null;
    if (!coversCenter) {
      return { valid: false, reason: "First word must cover center square" };
    }
  } else {
    // Check if new tiles connect to existing words
    const connectsToExisting = placedTiles.some(tile => {
      const { row, col } = tile;
      const neighbors: [number, number][] = [
        [row-1, col], [row+1, col], [row, col-1], [row, col+1]
      ];
      return neighbors.some(([r, c]) => 
        r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] !== null
      );
    });
    if (!connectsToExisting) {
      return { valid: false, reason: "New tiles must connect to existing words" };
    }
  }

  return { valid: true };
}

function getWordsFormed(board: (Tile | null)[][], placedTiles: PlacedTile[]): WordFormed[] {
  const words: WordFormed[] = [];
  const tempBoard = board.map(row => [...row]);
  
  // Place new tiles on temp board
  placedTiles.forEach(({ row, col, tile }) => {
    tempBoard[row][col] = tile;
  });

  // Find main word
  const sortedTiles = [...placedTiles].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });

  const isHorizontal = sortedTiles.every(tile => tile.row === sortedTiles[0].row);
  
  if (isHorizontal) {
    // Find horizontal word
    const row = sortedTiles[0].row;
    let startCol = sortedTiles[0].col;
    let endCol = sortedTiles[sortedTiles.length - 1].col;
    
    // Extend left
    while (startCol > 0 && tempBoard[row][startCol - 1] !== null) {
      startCol--;
    }
    
    // Extend right
    while (endCol < BOARD_SIZE - 1 && tempBoard[row][endCol + 1] !== null) {
      endCol++;
    }
    
    const word: Tile[] = [];
    for (let col = startCol; col <= endCol; col++) {
      const tile = tempBoard[row][col];
      if (tile) word.push(tile);
    }
    
    if (word.length > 1) {
      words.push({
        word: word.map(tile => tile.letter).join(''),
        tiles: word,
        positions: word.map((_, i) => ({ row, col: startCol + i }))
      });
    }
  } else {
    // Find vertical word
    const col = sortedTiles[0].col;
    let startRow = sortedTiles[0].row;
    let endRow = sortedTiles[sortedTiles.length - 1].row;
    
    // Extend up
    while (startRow > 0 && tempBoard[startRow - 1][col] !== null) {
      startRow--;
    }
    
    // Extend down
    while (endRow < BOARD_SIZE - 1 && tempBoard[endRow + 1][col] !== null) {
      endRow++;
    }
    
    const word: Tile[] = [];
    for (let row = startRow; row <= endRow; row++) {
      const tile = tempBoard[row][col];
      if (tile) word.push(tile);
    }
    
    if (word.length > 1) {
      words.push({
        word: word.map(tile => tile.letter).join(''),
        tiles: word,
        positions: word.map((_, i) => ({ row: startRow + i, col }))
      });
    }
  }

  // Find cross words
  placedTiles.forEach(({ row, col }) => {
    // Check vertical cross word (if main word is horizontal)
    if (isHorizontal) {
      let startRow = row;
      let endRow = row;
      
      while (startRow > 0 && tempBoard[startRow - 1][col] !== null) {
        startRow--;
      }
      
      while (endRow < BOARD_SIZE - 1 && tempBoard[endRow + 1][col] !== null) {
        endRow++;
      }
      
      if (startRow < endRow) {
        const word: Tile[] = [];
        for (let r = startRow; r <= endRow; r++) {
          const tile = tempBoard[r][col];
          if (tile) word.push(tile);
        }
        
        words.push({
          word: word.map(tile => tile.letter).join(''),
          tiles: word,
          positions: word.map((_, i) => ({ row: startRow + i, col }))
        });
      }
    } else {
      // Check horizontal cross word (if main word is vertical)
      let startCol = col;
      let endCol = col;
      
      while (startCol > 0 && tempBoard[row][startCol - 1] !== null) {
        startCol--;
      }
      
      while (endCol < BOARD_SIZE - 1 && tempBoard[row][endCol + 1] !== null) {
        endCol++;
      }
      
      if (startCol < endCol) {
        const word: Tile[] = [];
        for (let c = startCol; c <= endCol; c++) {
          const tile = tempBoard[row][c];
          if (tile) word.push(tile);
        }
        
        words.push({
          word: word.map(tile => tile.letter).join(''),
          tiles: word,
          positions: word.map((_, i) => ({ row, col: startCol + i }))
        });
      }
    }
  });

  return words;
}

async function validateWords(words: WordFormed[]): Promise<{ valid: boolean; invalidWord?: string }> {
  for (const wordData of words) {
    const isValid = await validateWordWithAPI(wordData.word);
    if (!isValid) {
      return { valid: false, invalidWord: wordData.word };
    }
  }
  return { valid: true };
}

function calculateScore(words: WordFormed[], placedTiles: PlacedTile[]): number {
  let totalScore = 0;

  words.forEach(wordData => {
    let wordScore = 0;
    let currentWordMultiplier = 1;

    wordData.positions.forEach(({ row, col }, index) => {
      const tile = wordData.tiles[index];
      let tileScore = tile.value;
      
      // Check if this tile was just placed
      const isNewTile = placedTiles.some(placed => placed.row === row && placed.col === col);
      
      if (isNewTile) {
        const premiumType = getPremiumType(row, col);
        
        switch (premiumType) {
          case 'DL':
            tileScore *= 2;
            break;
          case 'TL':
            tileScore *= 3;
            break;
          case 'DW':
            currentWordMultiplier *= 2;
            break;
          case 'TW':
            currentWordMultiplier *= 3;
            break;
        }
      }
      
      wordScore += tileScore;
    });

    totalScore += wordScore * currentWordMultiplier;
  });

  // Bonus for using all 7 tiles
  if (placedTiles.length === 7) {
    totalScore += 50;
  }

  return totalScore;
}

function checkGameEnd(gameState: GameState): boolean {
  // Game ends if tile bag is empty and a player has no tiles
  if (gameState.tileBag.length === 0) {
    for (const playerId in gameState.playerRacks) {
      if (gameState.playerRacks[playerId].length === 0) {
        return true;
      }
    }
  }
  
  // Game ends if all players pass twice in a row
  if (gameState.passCount >= gameState.players.length * 2) {
    return true;
  }
  
  return false;
}

function finalizeScore(gameState: GameState): Record<string, number> {
  const finalScores = { ...gameState.scores };
  
  // Subtract remaining tile values from each player's score
  for (const playerId in gameState.playerRacks) {
    const remainingTiles = gameState.playerRacks[playerId];
    const penalty = remainingTiles.reduce((sum, tile) => sum + tile.value, 0);
    finalScores[playerId] -= penalty;
  }
  
  // Find player who went out (if any) and add bonus
  for (const playerId in gameState.playerRacks) {
    if (gameState.playerRacks[playerId].length === 0) {
      const bonus = Object.values(gameState.playerRacks)
        .flat()
        .reduce((sum, tile) => sum + tile.value, 0);
      finalScores[playerId] += bonus;
      break;
    }
  }
  
  return finalScores;
}

// --------------------
// Socket.IO handlers
// --------------------
export function registerGameHandlers(io: Server, socket: Socket) {
  /*
  socket.on('startGame', (data: { roomCode: string }) => {
    console.log(data);
    const { roomCode } = data;
    const room = rooms.get(roomCode);
    
    if (!room || room.host.socketId !== socket.id) {
      socket.emit('error', { message: 'Only host can start game' });
      return;
    }
    
    if (room.players.length < 2) {
      socket.emit('error', { message: 'Need at least 2 players to start' });
      return;
    }
    
    room.gameStarted = true;
    const gameState = initializeGameState(roomCode, room.players);
    
    // Emit to all players in room
    io.to(roomCode).emit('gameStarted', {
      gameState: {
        board: gameState.board,
        scores: gameState.scores,
        currentTurn: gameState.currentTurn,
        players: gameState.players
      },
      playerRacks: gameState.playerRacks,
      tileBag: gameState.tileBag.length // Don't send actual tiles, just count
    });
    
    console.log(`Game started in room ${roomCode}`);
  });
*/
  socket.on('submitMove', async (data: { 
    roomCode: string; 
    placedTiles: PlacedTile[]; 
    board: (Tile | null)[][]; 
  }) => {
    const { roomCode, placedTiles } = data;
    const gameState = gameStates.get(roomCode);
    const room = rooms.get(roomCode);
    
    if (!gameState || !room) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    const currentPlayer = gameState.players[gameState.currentTurn];
    if (currentPlayer.socketId !== socket.id) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }
    
    if (placedTiles.length === 0) {
      socket.emit('error', { message: 'No tiles placed' });
      return;
    }
    
    // Validate placement
    const placementValidation = isValidWordPlacement(
      gameState.board, 
      placedTiles, 
      !gameState.firstWordPlayed
    );
    
    if (!placementValidation.valid) {
      socket.emit('error', { message: placementValidation.reason });
      return;
    }
    
    // Get words formed
    const wordsFormed = getWordsFormed(gameState.board, placedTiles);
    
    if (wordsFormed.length === 0) {
      socket.emit('error', { message: 'Must form at least one word' });
      return;
    }
    
    // Validate words using dictionary API
    const wordValidation = await validateWords(wordsFormed);
    if (!wordValidation.valid) {
      socket.emit('error', { 
        message: `Invalid word: ${wordValidation.invalidWord}` 
      });
      return;
    }
    
    // Calculate score
    const moveScore = calculateScore(wordsFormed, placedTiles);
    
    // Update game state
    placedTiles.forEach(({ row, col, tile }) => {
      gameState.board[row][col] = tile;
    });
    
    gameState.scores[currentPlayer.id] += moveScore;
    gameState.firstWordPlayed = true;
    gameState.passCount = 0;
    
    // Refill player's rack
    const tilesUsed = placedTiles.length;
    const newTiles = drawTiles(gameState.tileBag, tilesUsed);
    gameState.playerRacks[currentPlayer.id] = [
      ...gameState.playerRacks[currentPlayer.id],
      ...newTiles
    ];
    
    // Add words to game history
    gameState.wordsPlayed.push(...wordsFormed.map(w => ({
      word: w.word,
      player: currentPlayer.username,
      score: moveScore,
      turn: gameState.currentTurn
    })));
    
    // Check for game end
    if (checkGameEnd(gameState)) {
      gameState.gameEnded = true;
      const finalScores = finalizeScore(gameState);
      
      io.to(roomCode).emit('gameEnded', {
        finalScores,
        winner: Object.entries(finalScores).reduce((a, b) => 
          finalScores[a[0]] > finalScores[b[0]] ? a : b
        )[0],
        wordsPlayed: gameState.wordsPlayed
      });
      
      return;
    }
    
    // Next turn
    gameState.currentTurn = (gameState.currentTurn + 1) % gameState.players.length;
    
    // Emit updated state
    io.to(roomCode).emit('moveSubmitted', {
      board: gameState.board,
      scores: gameState.scores,
      currentTurn: gameState.currentTurn,
      moveScore,
      wordsFormed: wordsFormed.map(w => w.word),
      player: currentPlayer.username
    });
    
    // Send updated rack to player
    socket.emit('tilesDrawn', {
      playerId: currentPlayer.id,
      tiles: gameState.playerRacks[currentPlayer.id]
    });
    
    // Send turn change message
    const nextPlayer = gameState.players[gameState.currentTurn];
    io.to(roomCode).emit('turnChanged', {
      currentTurn: gameState.currentTurn,
      message: `${currentPlayer.username} scored ${moveScore} points! ${nextPlayer.username}'s turn.`
    });
    
    console.log(`Move submitted in room ${roomCode} by ${currentPlayer.username}, scored ${moveScore}`);
  });

  socket.on('passTurn', (data: { roomCode: string }) => {
    const { roomCode } = data;
    const gameState = gameStates.get(roomCode);
    const room = rooms.get(roomCode);
    
    if (!gameState || !room) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    const currentPlayer = gameState.players[gameState.currentTurn];
    if (currentPlayer.socketId !== socket.id) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }
    
    gameState.passCount++;
    
    // Check for game end
    if (checkGameEnd(gameState)) {
      gameState.gameEnded = true;
      const finalScores = finalizeScore(gameState);
      
      io.to(roomCode).emit('gameEnded', {
        finalScores,
        winner: Object.entries(finalScores).reduce((a, b) => 
          finalScores[a[0]] > finalScores[b[0]] ? a : b
        )[0],
        wordsPlayed: gameState.wordsPlayed
      });
      
      return;
    }
    
    // Next turn
    gameState.currentTurn = (gameState.currentTurn + 1) % gameState.players.length;
    
    const nextPlayer = gameState.players[gameState.currentTurn];
    io.to(roomCode).emit('turnChanged', {
      currentTurn: gameState.currentTurn,
      message: `${currentPlayer.username} passed. ${nextPlayer.username}'s turn.`
    });
    
    console.log(`${currentPlayer.username} passed turn in room ${roomCode}`);
  });

  socket.on('exchangeTiles', (data: { roomCode: string; tilesToExchange: ExchangeTile[] }) => {
    const { roomCode, tilesToExchange } = data;
    const gameState = gameStates.get(roomCode);
    const room = rooms.get(roomCode);
    
    if (!gameState || !room) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    const currentPlayer = gameState.players[gameState.currentTurn];
    if (currentPlayer.socketId !== socket.id) {
      socket.emit('error', { message: 'Not your turn' });
      return;
    }
    
    if (gameState.tileBag.length < tilesToExchange.length) {
      socket.emit('error', { message: 'Not enough tiles in bag' });
      return;
    }
    
    // Remove tiles from player's rack
    const playerRack = gameState.playerRacks[currentPlayer.id];
    const newRack = playerRack.filter((tile, index) => 
      !tilesToExchange.some(exchTile => exchTile.rackIndex === index)
    );
    
    // Add exchanged tiles back to bag
    const exchangedTiles = tilesToExchange.map(exchTile => 
      playerRack[exchTile.rackIndex]
    );
    gameState.tileBag.push(...exchangedTiles);
    gameState.tileBag = shuffleArray(gameState.tileBag);
    
    // Draw new tiles
    const newTiles = drawTiles(gameState.tileBag, tilesToExchange.length);
    gameState.playerRacks[currentPlayer.id] = [...newRack, ...newTiles];
    
    // Next turn
    gameState.currentTurn = (gameState.currentTurn + 1) % gameState.players.length;
    
    // Send updated rack to player
    socket.emit('tilesDrawn', {
      playerId: currentPlayer.id,
      tiles: gameState.playerRacks[currentPlayer.id]
    });
    
    const nextPlayer = gameState.players[gameState.currentTurn];
    io.to(roomCode).emit('turnChanged', {
      currentTurn: gameState.currentTurn,
      message: `${currentPlayer.username} exchanged ${tilesToExchange.length} tiles. ${nextPlayer.username}'s turn.`
    });
    
    console.log(`${currentPlayer.username} exchanged ${tilesToExchange.length} tiles in room ${roomCode}`);
  });

  socket.on('getGameState', (data: { roomCode: string }) => {
    const { roomCode } = data;
    const gameState = gameStates.get(roomCode);
    
    if (!gameState) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    const playerRoomCode = playerRooms.get(socket.id);
    if (playerRoomCode !== roomCode) {
      socket.emit('error', { message: 'Not in this game' });
      return;
    }
    
    const currentPlayer = gameState.players.find(p => p.socketId === socket.id);
    if (!currentPlayer) {
      socket.emit('error', { message: 'Player not found' });
      return;
    }
    
    socket.emit('gameState', {
      board: gameState.board,
      scores: gameState.scores,
      currentTurn: gameState.currentTurn,
      players: gameState.players,
      playerRacks: { [currentPlayer.id]: gameState.playerRacks[currentPlayer.id] },
      gameEnded: gameState.gameEnded,
      wordsPlayed: gameState.wordsPlayed
    });
  });

  socket.on('disconnect', () => {
    // Handle player disconnection during game
    const roomCode = playerRooms.get(socket.id);
    if (roomCode) {
      const gameState = gameStates.get(roomCode);
      const room = rooms.get(roomCode);
      
      if (gameState && room && room.gameStarted) {
        const disconnectedPlayer = gameState.players.find(p => p.socketId === socket.id);
        if (disconnectedPlayer) {
          io.to(roomCode).emit('gameMessage', {
            message: `${disconnectedPlayer.username} disconnected. Game paused.`
          });
        }
      }
    }
  });
}