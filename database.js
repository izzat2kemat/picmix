const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_FILE = path.join(__dirname, 'db.json');

// Initialize database
function initDb() {
  if (!fs.existsSync(DB_FILE)) {
    const defaultData = {
      users: [],
      scores: [],
      images: [],
      matches: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
    
    // Create seed admin user
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('admin123', salt);
    
    const adminUser = {
      id: 'admin-id',
      username: 'admin',
      passwordHash: hash,
      isAdmin: true,
      createdAt: new Date().toISOString()
    };
    
    defaultData.users.push(adminUser);
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf8');
  }
}

// Read database helper
function readData() {
  initDb();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading database file:', err);
    return { users: [], scores: [], images: [], matches: [] };
  }
}

// Write database helper
function writeData(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing to database file:', err);
    return false;
  }
}

// Register user
function register(username, password, isAdmin = false) {
  const data = readData();
  const lowerUsername = username.trim().toLowerCase();
  
  const existing = data.users.find(u => u.username.toLowerCase() === lowerUsername);
  if (existing) {
    return { success: false, message: 'Username already taken' };
  }
  
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);
  
  const newUser = {
    id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    username: username.trim(),
    passwordHash: hash,
    isAdmin: !!isAdmin,
    createdAt: new Date().toISOString()
  };
  
  data.users.push(newUser);
  
  // Initialize user scoring record
  const newScore = {
    username: newUser.username,
    wins: 0,
    losses: 0,
    gamesPlayed: 0,
    rankPoints: 1000 // Start with 1000 ELO-like ranking points
  };
  data.scores.push(newScore);
  
  writeData(data);
  return { success: true, user: { id: newUser.id, username: newUser.username, isAdmin: newUser.isAdmin } };
}

// Login user
function login(username, password) {
  const data = readData();
  const lowerUsername = username.trim().toLowerCase();
  
  const user = data.users.find(u => u.username.toLowerCase() === lowerUsername);
  if (!user) {
    return { success: false, message: 'Invalid username or password' };
  }
  
  const matches = bcrypt.compareSync(password, user.passwordHash);
  if (!matches) {
    return { success: false, message: 'Invalid username or password' };
  }
  
  return { success: true, user: { id: user.id, username: user.username, isAdmin: user.isAdmin } };
}

// Add/Update score
function recordMatchResult(winnerUsername, loserUsername) {
  const data = readData();
  
  // Find or create score records
  let winnerScore = data.scores.find(s => s.username.toLowerCase() === winnerUsername.toLowerCase());
  let loserScore = data.scores.find(s => s.username.toLowerCase() === loserUsername.toLowerCase());
  
  if (!winnerScore) {
    winnerScore = { username: winnerUsername, wins: 0, losses: 0, gamesPlayed: 0, rankPoints: 1000 };
    data.scores.push(winnerScore);
  }
  if (!loserScore) {
    loserScore = { username: loserUsername, wins: 0, losses: 0, gamesPlayed: 0, rankPoints: 1000 };
    data.scores.push(loserScore);
  }
  
  winnerScore.wins += 1;
  winnerScore.gamesPlayed += 1;
  winnerScore.rankPoints += 25; // Gain 25 points
  
  loserScore.losses += 1;
  loserScore.gamesPlayed += 1;
  loserScore.rankPoints = Math.max(0, loserScore.rankPoints - 15); // Lose 15 points (min 0)
  
  // Add match history log
  const matchLog = {
    id: 'match_' + Date.now(),
    winner: winnerUsername,
    loser: loserUsername,
    playedAt: new Date().toISOString()
  };
  data.matches.push(matchLog);
  
  writeData(data);
}

// Get leaderboards
function getLeaderboard() {
  const data = readData();
  // Sort by rankPoints descending
  return [...data.scores].sort((a, b) => b.rankPoints - a.rankPoints);
}

// Get uploaded images
function getImages() {
  const data = readData();
  return data.images;
}

// Save image upload meta
function addImage(name, filename, uploadedBy) {
  const data = readData();
  const newImage = {
    id: 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    name: name,
    filename: filename,
    uploadedBy: uploadedBy || 'admin',
    createdAt: new Date().toISOString()
  };
  data.images.push(newImage);
  writeData(data);
  return newImage;
}

// Get active matches for dashboard display
function getRecentMatches() {
  const data = readData();
  return [...data.matches].reverse().slice(0, 10);
}

module.exports = {
  initDb,
  register,
  login,
  recordMatchResult,
  getLeaderboard,
  getImages,
  addImage,
  getRecentMatches
};
