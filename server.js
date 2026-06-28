require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const database = require('./database');

const app = express();
const server = http.createServer(app);
const BASE_PATH = '/picmix';

// Allowed origins — add your InfinityFree domain here
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://easforward.rf.gd',
  'http://easforward.rf.gd',
  process.env.DOMAIN_NAME ? `https://${process.env.DOMAIN_NAME}` : null,
  process.env.DOMAIN_NAME ? `http://${process.env.DOMAIN_NAME}` : null,
].filter(Boolean);

const io = socketIo(server, {
  path: `${BASE_PATH}/socket.io`,
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true
  }
});
const router = express.Router();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'picmix-secret-key-ai-budak-batu-9-cheras-2026';

// Initialize Database
database.initDb();

// Create upload directories
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const defaultImagesDir = path.join(__dirname, 'public', 'images', 'defaults');
if (!fs.existsSync(defaultImagesDir)) {
  fs.mkdirSync(defaultImagesDir, { recursive: true });
}

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    callback(null, true);
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(BASE_PATH, express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.redirect(BASE_PATH));

// Configure Multer for admin image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Helper to authenticate JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ success: false, message: 'Access token missing' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

// Helper to verify Admin role
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ success: false, message: 'Requires administrator privileges' });
  }
  next();
}

// ----------------------------------------------------
// REST API ROUTES
// ----------------------------------------------------

// Register route
router.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }
  if (username.length < 3) {
    return res.status(400).json({ success: false, message: 'Username must be at least 3 characters' });
  }
  
  const result = database.register(username, password);
  if (!result.success) {
    return res.status(400).json({ success: false, message: result.message });
  }
  
  const token = jwt.sign(result.user, JWT_SECRET, { expiresIn: '24h' });
  res.json({ success: true, token, user: result.user });
});

// Login route
router.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }
  
  const result = database.login(username, password);
  if (!result.success) {
    return res.status(400).json({ success: false, message: result.message });
  }
  
  const token = jwt.sign(result.user, JWT_SECRET, { expiresIn: '24h' });
  res.json({ success: true, token, user: result.user });
});

// Get profile details (including score)
router.get('/api/auth/me', authenticateToken, (req, res) => {
  const leaderboard = database.getLeaderboard();
  const userScore = leaderboard.find(s => s.username.toLowerCase() === req.user.username.toLowerCase()) || {
    username: req.user.username, wins: 0, losses: 0, gamesPlayed: 0, rankPoints: 1000
  };
  res.json({ success: true, user: req.user, stats: userScore });
});

// Get available puzzle images
router.get('/api/images', (req, res) => {
  // Read database custom images
  const dbImages = database.getImages().map(img => ({
    id: img.id,
    name: img.name,
    url: `${BASE_PATH}/uploads/${img.filename}`
  }));
  
  // Read default images from the defaults directory
  const defaults = [];
  try {
    const files = fs.readdirSync(defaultImagesDir);
    files.forEach((file, index) => {
      if (/\.(jpg|jpeg|png|webp|gif)$/i.test(file)) {
        defaults.push({
          id: `default_${index}`,
          name: file.split('.')[0].replace(/_/g, ' '),
          url: `${BASE_PATH}/images/defaults/${file}`,
          isDefault: true
        });
      }
    });
  } catch (err) {
    console.error('Error reading default images:', err);
  }
  
  // Combine custom uploads and defaults
  res.json({ success: true, images: [...defaults, ...dbImages] });
});

// Admin upload route
router.post('/api/admin/upload', authenticateToken, requireAdmin, upload.single('image'), (req, res) => {
  const { name } = req.body;
  if (!name || !req.file) {
    return res.status(400).json({ success: false, message: 'Image name and file are required' });
  }
  
  const imageRecord = database.addImage(name, req.file.filename, req.user.username);
  res.json({ success: true, image: imageRecord });
});

// Get Leaderboard Data for Dashboard
router.get('/api/dashboard/leaderboard', (req, res) => {
  const leaderboard = database.getLeaderboard();
  const recentMatches = database.getRecentMatches();
  res.json({ success: true, leaderboard, recentMatches });
});

// Catch-all route to serve SPA pages if users refresh
router.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
router.get('/game', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
});
router.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Mount the Router on BASE_PATH
app.use(BASE_PATH, router);

// ----------------------------------------------------
// SOCKET.IO MULTIPLAYER GAMEPLAY COORDINATION
// ----------------------------------------------------

const matchmakingQueue = []; // Sockets of players waiting for match
const activeGames = new Map(); // RoomId -> Game State
const socketToUser = new Map(); // SocketId -> User details

// Helper to generate a solvable 3x3 sliding puzzle configuration
// We start with solved grid: [0,1,2,3,4,5,6,7,8] where 8 is the empty slot.
// We make a series of random valid slides to ensure it is solvable.
function generateSolvablePuzzle(moves = 100) {
  const grid = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  let emptyIndex = 8; // Start at bottom right
  
  // Helper to get valid moves for the empty tile index
  const getValidMoves = (idx) => {
    const valid = [];
    const row = Math.floor(idx / 3);
    const col = idx % 3;
    
    if (row > 0) valid.push(idx - 3); // Up
    if (row < 2) valid.push(idx + 3); // Down
    if (col > 0) valid.push(idx - 1); // Left
    if (col < 2) valid.push(idx + 1); // Right
    
    return valid;
  };
  
  let lastIndex = -1;
  for (let i = 0; i < moves; i++) {
    const choices = getValidMoves(emptyIndex).filter(c => c !== lastIndex);
    if (choices.length === 0) continue;
    const nextIdx = choices[Math.floor(Math.random() * choices.length)];
    
    // Swap empty space with target tile
    grid[emptyIndex] = grid[nextIdx];
    grid[nextIdx] = 8;
    
    lastIndex = emptyIndex;
    emptyIndex = nextIdx;
  }
  
  return grid;
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  
  // Authenticate socket association
  socket.on('auth', (token) => {
    if (!token) return;
    jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
      if (err) {
        socket.emit('auth-failed', 'Invalid token');
        return;
      }
      
      socketToUser.set(socket.id, decodedUser);
      socket.emit('authenticated', decodedUser);
      
      // Update dashboard users list
      io.emit('dashboard-stats-update', getDashboardStats());
      console.log(`Socket ${socket.id} authenticated as ${decodedUser.username}`);
    });
  });
  
  // Matchmaking: Join queue
  socket.on('join-queue', () => {
    const user = socketToUser.get(socket.id);
    if (!user) {
      socket.emit('error-msg', 'Please log in to join matchmaking.');
      return;
    }
    
    // Avoid duplicate queueing
    if (matchmakingQueue.some(s => s.id === socket.id)) {
      return;
    }
    
    // Remove if user already has an active queue on another socket with same username
    const existingIndex = matchmakingQueue.findIndex(s => {
      const u = socketToUser.get(s.id);
      return u && u.username.toLowerCase() === user.username.toLowerCase();
    });
    if (existingIndex !== -1) {
      matchmakingQueue.splice(existingIndex, 1);
    }
    
    matchmakingQueue.push(socket);
    console.log(`Player ${user.username} joined matchmaking queue. Queue length: ${matchmakingQueue.length}`);
    
    // Notify client they are waiting
    socket.emit('waiting-for-match');
    
    // Check if we can start gathering/pairing players
    tryTriggerMatch();
  });
  
  // Matchmaking: Leave queue
  socket.on('leave-queue', () => {
    const idx = matchmakingQueue.findIndex(s => s.id === socket.id);
    if (idx !== -1) {
      matchmakingQueue.splice(idx, 1);
      socket.emit('queue-left');
      console.log(`Socket ${socket.id} left queue. Queue length: ${matchmakingQueue.length}`);
      
      // Update queue counts for everyone else
      tryTriggerMatch();
    }
  });
  
  // Gameplay: Client reported tile move/progress
  socket.on('game-progress', ({ roomId, progress, grid }) => {
    const user = socketToUser.get(socket.id);
    if (!user) return;
    
    const game = activeGames.get(roomId);
    if (!game || game.status !== 'playing') return;
    
    const p = game.players.find(pl => pl.username === user.username);
    if (p) {
      p.progress = progress;
      p.grid = grid;
      
      // Broadcast this player's progress and grid to the entire room (except themselves)
      socket.to(roomId).emit('opponent-progress', {
        username: user.username,
        progress,
        grid
      });
    }
    
    // Emit progress change to dashboard
    io.emit('dashboard-games-update', getActiveRoomsInfo());
  });
  
  // Gameplay: Player solved the puzzle
  socket.on('game-solved', ({ roomId }) => {
    const user = socketToUser.get(socket.id);
    if (!user) return;
    
    const game = activeGames.get(roomId);
    if (!game || game.status !== 'playing') return;
    
    game.status = 'finished';
    game.winner = user.username;
    if (game.timer) clearInterval(game.timer);
    
    // Record match result in database (Winner wins against each other player)
    game.players.forEach(p => {
      if (p.username !== user.username) {
        database.recordMatchResult(user.username, p.username);
      }
    });
    
    // Notify both players in room
    io.to(roomId).emit('game-over', {
      winner: user.username,
      players: game.players.map(p => ({ username: p.username, progress: p.progress })),
      reason: 'solved'
    });
    
    // Clean up room from active list
    activeGames.delete(roomId);
    
    // Notify dashboards
    io.emit('dashboard-update');
    io.emit('dashboard-stats-update', getDashboardStats());
    io.emit('dashboard-games-update', getActiveRoomsInfo());
    
    console.log(`Game in ${roomId} finished. Winner: ${user.username}`);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    
    // Remove from matchmaking queue
    const queueIdx = matchmakingQueue.findIndex(s => s.id === socket.id);
    if (queueIdx !== -1) {
      matchmakingQueue.splice(queueIdx, 1);
      tryTriggerMatch();
    }
    
    const user = socketToUser.get(socket.id);
    if (user) {
      // Find if they are in an active game
      for (const [roomId, game] of activeGames.entries()) {
        if (game.status === 'playing') {
          const pIdx = game.players.findIndex(p => p.username === user.username);
          if (pIdx !== -1) {
            // Remove player from the room
            game.players.splice(pIdx, 1);
            
            // Notify remaining players in the room
            io.to(roomId).emit('player-left', { username: user.username });
            
            // Record match loss for disconnected player
            if (game.players.length > 0) {
              database.recordMatchResult(game.players[0].username, user.username);
            }
            
            // If only 1 player remains in the room, they win by default!
            if (game.players.length === 1) {
              game.status = 'finished';
              if (game.timer) clearInterval(game.timer);
              
              const remainingPlayer = game.players[0];
              io.to(roomId).emit('game-over', {
                winner: remainingPlayer.username,
                players: [{ username: remainingPlayer.username, progress: remainingPlayer.progress }, { username: user.username, progress: 0 }],
                reason: 'forfeit',
                message: `All other opponents disconnected! ${remainingPlayer.username} wins by forfeit!`
              });
              
              activeGames.delete(roomId);
            }
            
            io.emit('dashboard-update');
            io.emit('dashboard-stats-update', getDashboardStats());
            io.emit('dashboard-games-update', getActiveRoomsInfo());
            console.log(`Player ${user.username} disconnected from room ${roomId}.`);
            break;
          }
        }
      }
      
      socketToUser.delete(socket.id);
      io.emit('dashboard-stats-update', getDashboardStats());
    }
  });
  
  // Lobby Chat Send
  socket.on('lobby-chat-send', (text) => {
    const user = socketToUser.get(socket.id);
    if (!user) return;
    io.emit('chat-message', { sender: user.username, text: text });
  });
  
  // Dashboard Specific Request: Get active matches
  socket.on('get-dashboard-data', () => {
    socket.emit('dashboard-data', {
      leaderboard: database.getLeaderboard(),
      recentMatches: database.getRecentMatches(),
      stats: getDashboardStats(),
      activeGames: getActiveRoomsInfo()
    });
  });
});

let matchmakingTimer = null;
let matchmakingCountdown = 0;

// Gather all waiting players after 5 seconds of the first pairing trigger
function tryTriggerMatch() {
  if (matchmakingQueue.length < 2) {
    if (matchmakingQueue.length === 0 && matchmakingTimer) {
      clearInterval(matchmakingTimer);
      matchmakingTimer = null;
      matchmakingCountdown = 0;
    }
    broadcastQueueStatus();
    return;
  }
  
  // Start countdown if it's not already running
  if (!matchmakingTimer) {
    matchmakingCountdown = 5; // Wait 5 seconds for more players to join
    broadcastQueueStatus();
    
    matchmakingTimer = setInterval(() => {
      matchmakingCountdown--;
      broadcastQueueStatus();
      
      if (matchmakingCountdown <= 0) {
        clearInterval(matchmakingTimer);
        matchmakingTimer = null;
        
        // Launch multiplayer match room with all queued sockets
        launchMultiplayerMatch();
      }
    }, 1000);
  } else {
    broadcastQueueStatus();
  }
}

// Notify queue status
function broadcastQueueStatus() {
  const playersInQueue = matchmakingQueue.map(s => {
    const u = socketToUser.get(s.id);
    return u ? u.username : 'Anonymous';
  });
  
  io.emit('matchmaking-queue-update', {
    count: matchmakingQueue.length,
    players: playersInQueue,
    countdown: matchmakingCountdown
  });
}

// Assemble all players from the queue into one match room
function launchMultiplayerMatch() {
  if (matchmakingQueue.length < 2) return;
  
  const participants = [];
  while (matchmakingQueue.length > 0) {
    const s = matchmakingQueue.shift();
    const u = socketToUser.get(s.id);
    if (u) {
      participants.push({ socket: s, user: u });
    }
  }
  
  if (participants.length < 2) {
    // Re-queue remaining
    participants.forEach(p => matchmakingQueue.push(p.socket));
    return;
  }
  
  const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  
  // Select round image
  const dbImages = database.getImages();
  const defaults = [];
  try {
    const files = fs.readdirSync(defaultImagesDir);
    files.forEach((file, index) => {
      if (/\.(jpg|jpeg|png|webp|gif)$/i.test(file)) {
        defaults.push({
          name: file.split('.')[0].replace(/_/g, ' '),
          url: `/images/defaults/${file}`
        });
      }
    });
  } catch (e) {}
  
  const allImages = [
    ...defaults,
    ...dbImages.map(img => ({ name: img.name, url: `/uploads/${img.filename}` }))
  ];
  
  const selectedImage = allImages.length > 0 
    ? allImages[Math.floor(Math.random() * allImages.length)] 
    : { name: 'Vibrant Geometric Pattern', url: 'fallback' };
    
  // Shuffle unsolvability-safe layout
  const startingGrid = generateSolvablePuzzle(60);
  
  const playersState = participants.map(p => {
    p.socket.join(roomId);
    return {
      username: p.user.username,
      progress: 0,
      grid: [...startingGrid],
      socket: p.socket
    };
  });
  
  const gameState = {
    roomId,
    image: selectedImage,
    status: 'playing',
    players: playersState,
    timeLeft: 90,
    createdAt: new Date().toISOString()
  };
  
  activeGames.set(roomId, gameState);
  
  // Start server countdown timer (3.5s delay to align with client countdown screen)
  setTimeout(() => {
    const game = activeGames.get(roomId);
    if (!game || game.status !== 'playing') return;
    
    io.to(roomId).emit('timer-tick', { timeLeft: game.timeLeft });
    
    const gameTimer = setInterval(() => {
      const curGame = activeGames.get(roomId);
      if (!curGame || curGame.status !== 'playing') {
        clearInterval(gameTimer);
        return;
      }
      
      curGame.timeLeft--;
      io.to(roomId).emit('timer-tick', { timeLeft: curGame.timeLeft });
      
      if (curGame.timeLeft <= 0) {
        clearInterval(gameTimer);
        handleGameTimeout(roomId);
      }
    }, 1000);
    
    game.timer = gameTimer;
  }, 3500);
  
  // Notify room
  io.to(roomId).emit('game-init', {
    roomId,
    image: selectedImage,
    startingGrid,
    opponents: playersState.map(p => p.username)
  });
  
  // Update dashboard and stats
  io.emit('dashboard-update');
  io.emit('dashboard-games-update', getActiveRoomsInfo());
  
  console.log(`Match started with ${playersState.length} players in room ${roomId}`);
}

// Handle game round timeout when timer hits 0
function handleGameTimeout(roomId) {
  const game = activeGames.get(roomId);
  if (!game || game.status !== 'playing') return;
  
  game.status = 'finished';
  
  // Sort players by progress descending
  const sorted = [...game.players].sort((a, b) => b.progress - a.progress);
  const topProgress = sorted[0].progress;
  const leaders = sorted.filter(p => p.progress === topProgress);
  
  if (leaders.length === 1) {
    const winner = leaders[0].username;
    
    // Record ELO win/losses in database
    game.players.forEach(p => {
      if (p.username !== winner) {
        database.recordMatchResult(winner, p.username);
      }
    });
    
    io.to(roomId).emit('game-over', {
      winner: winner,
      players: game.players.map(p => ({ username: p.username, progress: p.progress })),
      reason: 'timeout',
      message: `Time's up! ${winner} wins by highest progress: ${topProgress}%!`
    });
  } else {
    // Timeout ended in a draw
    io.to(roomId).emit('game-over', {
      winner: null,
      players: game.players.map(p => ({ username: p.username, progress: p.progress })),
      reason: 'timeout-draw',
      message: `Time's up! It's a draw between ${leaders.map(l => l.username).join(', ')} at ${topProgress}% progress!`
    });
  }
  
  activeGames.delete(roomId);
  io.emit('dashboard-update');
  io.emit('dashboard-stats-update', getDashboardStats());
  io.emit('dashboard-games-update', getActiveRoomsInfo());
}

// Stats helper
function getDashboardStats() {
  const onlineCount = socketToUser.size;
  const inQueueCount = matchmakingQueue.length;
  
  let inGameCount = 0;
  for (const game of activeGames.values()) {
    inGameCount += game.players.length;
  }
  
  return {
    online: onlineCount,
    inQueue: inQueueCount,
    inGame: inGameCount
  };
}

// Active rooms info helper (strips out socket references to prevent circular json serialization)
function getActiveRoomsInfo() {
  const rooms = [];
  for (const [roomId, game] of activeGames.entries()) {
    rooms.push({
      roomId,
      image: game.image,
      players: game.players.map(p => ({ username: p.username, progress: p.progress })),
      status: game.status,
      elapsedSec: Math.floor((Date.now() - new Date(game.createdAt).getTime()) / 1000)
    });
  }
  return rooms;
}

// Start Server
server.listen(PORT, () => {
  console.log(`===========================================================`);
  console.log(`  PICMIX SERVER STARTED RUNNING AT http://localhost:${PORT}`);
  console.log(`  Created by AI Budak batu 9 cheras`);
  console.log(`===========================================================`);
});
