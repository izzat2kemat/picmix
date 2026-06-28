// Multiplayer Game Controller (HTML5 Canvas Engine)
let socket = null;
let gameData = null;
let playerUsername = null;

// Game State
let playerGrid = [];
const opponentsMap = new Map(); // username -> { canvas, ctx, grid, progress }
let movesCount = 0;
let startTime = null;
let isGameActive = false;
let gameImage = new Image();
let imageLoaded = false;

// Canvas Configuration
const TILE_SIZE = 400 / 3; // 400x400 canvas, 3x3 tiles
const playerCanvas = document.getElementById('player-canvas');
const playerCtx = playerCanvas.getContext('2d');

// Toast notification trigger
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast-container');
  const toastMsg = document.getElementById('toast-msg');
  toast.className = 'toast';
  if (type === 'error') toast.classList.add('error');
  if (type === 'success') toast.classList.add('success');
  toastMsg.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4000);
}

// Load Game Data from Session Storage
function loadGameData() {
  const token = localStorage.getItem('token');
  if (!token) {
    showToast('Unauthorized. Redirecting to lobby...', 'error');
    setTimeout(() => window.location.href = '/', 1500);
    return;
  }
  
  // Decode username from JWT
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    playerUsername = payload.username;
    document.getElementById('nav-username').textContent = playerUsername;
    document.getElementById('nav-user-avatar').textContent = playerUsername.charAt(0).toUpperCase();
  } catch (e) {
    showToast('Session expired. Please log in again.', 'error');
    setTimeout(() => window.location.href = '/', 1500);
    return;
  }
  
  const rawGame = sessionStorage.getItem('picmix_current_game');
  if (!rawGame) {
    showToast('No active match found. Returning to lobby...', 'error');
    setTimeout(() => window.location.href = '/', 1500);
    return;
  }
  
  gameData = JSON.parse(rawGame);
  
  document.getElementById('puzzle-title').textContent = `Puzzle: ${gameData.image.name}`;
  document.getElementById('reference-img').src = gameData.image.url === 'fallback' ? '/images/defaults/cyber_puzzle.png' : gameData.image.url;
  
  // Initialize player grid layouts
  playerGrid = [...gameData.startingGrid];
  
  // Setup Opponent Dynamic Canvases
  const container = document.getElementById('opponents-container');
  container.innerHTML = '';
  
  // Filter out the player's own username
  const opponentsList = gameData.opponents.filter(name => name.toLowerCase() !== playerUsername.toLowerCase());
  
  opponentsList.forEach(name => {
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-wrapper';
    wrapper.innerHTML = `
      <h4 class="opponent">${name.toUpperCase()}</h4>
      <div style="position: relative;">
        <canvas id="canvas-${name}" class="game-canvas" width="400" height="400" style="opacity: 0.8; filter: brightness(0.85); pointer-events: none;"></canvas>
      </div>
      <div style="width: 100%; text-align: left; margin-top: 5px;">
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px;">
          <span>Progress:</span>
          <span id="pct-${name}" style="font-weight: bold; color: var(--color-secondary);">0%</span>
        </div>
        <div class="progress-bar-container">
          <div id="bar-${name}" class="progress-fill opponent"></div>
        </div>
      </div>
    `;
    container.appendChild(wrapper);
    
    const canvas = document.getElementById(`canvas-${name}`);
    const ctx = canvas.getContext('2d');
    opponentsMap.set(name, {
      canvas,
      ctx,
      grid: [...gameData.startingGrid],
      progress: 0
    });
  });
  
  // Connect socket
  initGameSocket(token);
}

// Socket communication
function initGameSocket(token) {
  socket = io(BACKEND_URL, { path: SOCKET_PATH });
  
  socket.on('connect', () => {
    socket.emit('auth', token);
  });
  
  socket.on('authenticated', () => {
    // Join socket.io game room
    socket.emit('game-progress', {
      roomId: gameData.roomId,
      progress: getProgressPercentage(playerGrid),
      grid: playerGrid
    });
    
    startCountdown();
  });
  
  // Real-time opponent progress update listener
  socket.on('opponent-progress', ({ username, progress, grid }) => {
    const opp = opponentsMap.get(username);
    if (opp) {
      opp.grid = grid;
      opp.progress = progress;
      
      // Update UI elements
      document.getElementById(`pct-${username}`).textContent = `${progress}%`;
      document.getElementById(`bar-${username}`).style.width = `${progress}%`;
      
      // Re-render
      renderCanvas(opp.canvas, opp.ctx, grid);
    }
    
    addBattleLog(`${username} made a move. Progress: ${progress}%`);
  });
  
  // Handle other players leaving/disconnecting
  socket.on('player-left', ({ username }) => {
    addBattleLog(`❌ ${username} has disconnected from the match!`);
    const opp = opponentsMap.get(username);
    if (opp) {
      document.getElementById(`pct-${username}`).textContent = `DISCONNECTED`;
      document.getElementById(`pct-${username}`).style.color = '#ef4444';
      document.getElementById(`bar-${username}`).style.width = `0%`;
      opp.canvas.style.opacity = '0.3';
    }
  });
  
  // Timer tick listener
  socket.on('timer-tick', ({ timeLeft }) => {
    const timerVal = document.getElementById('timer-val');
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    timerVal.textContent = `${m}:${s}`;
    
    if (timeLeft <= 15) {
      timerVal.style.color = '#ef4444';
      timerVal.style.textShadow = '0 0 10px rgba(239, 68, 68, 0.5)';
    } else {
      timerVal.style.color = 'white';
      timerVal.style.textShadow = 'none';
    }
  });
  
  // Game Over listener
  socket.on('game-over', ({ winner, players, reason, message }) => {
    endGame();
    
    const resultModal = document.getElementById('result-modal');
    const resultTitle = document.getElementById('result-title');
    const resultDesc = document.getElementById('result-desc');
    const finalTime = document.getElementById('final-time');
    const finalMoves = document.getElementById('final-moves');
    const finalElo = document.getElementById('final-elo');
    
    // Calculate match duration
    const totalSecs = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    const m = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const s = (totalSecs % 60).toString().padStart(2, '0');
    finalTime.textContent = `${m}:${s}`;
    finalMoves.textContent = movesCount;
    
    // Generate Standings summary list
    let rankingHtml = '';
    if (players) {
      const sorted = [...players].sort((a, b) => b.progress - a.progress);
      rankingHtml = '<div style="margin-top: 15px; font-size: 0.85rem; border-top: 1px solid var(--border-glass); padding-top: 10px;"><strong style="color: var(--color-cyan);">Final Standings:</strong>';
      sorted.forEach((p, idx) => {
        const isWinner = p.username === winner;
        rankingHtml += `<div style="display: flex; justify-content: space-between; margin-top: 5px; color: ${isWinner ? 'var(--color-cyan)' : 'var(--text-main)'};">
          <span>${idx + 1}. ${p.username} ${isWinner ? '🏆' : ''}</span>
          <strong>${p.progress}%</strong>
        </div>`;
      });
      rankingHtml += '</div>';
    }
    
    if (winner === playerUsername) {
      resultTitle.className = 'finish-title win';
      resultTitle.textContent = 'VICTORY!';
      resultDesc.innerHTML = (message || 'You solved the puzzle first! Amazing speeds.') + rankingHtml;
      finalElo.textContent = '+25 ELO';
      finalElo.style.color = '#4ade80';
      showToast('Congratulations! You won the battle!', 'success');
    } else {
      resultTitle.className = 'finish-title lose';
      resultTitle.textContent = winner ? 'DEFEAT' : 'DRAW';
      resultDesc.innerHTML = (message || `Solved by ${winner}. Keep practicing!`) + rankingHtml;
      finalElo.textContent = winner ? '-15 ELO' : '+0 ELO';
      finalElo.style.color = winner ? '#f87171' : 'white';
      showToast(winner ? `${winner} won the battle. Defeat!` : 'The match ended in a draw.', 'info');
    }
    
    resultModal.style.display = 'flex';
  });
  
  socket.on('error-msg', (msg) => {
    showToast(msg, 'error');
  });
}

// 3-2-1 Countdown before game begins
function startCountdown() {
  const countdownScreen = document.getElementById('countdown-screen');
  let countdown = 3;
  
  countdownScreen.textContent = countdown;
  
  const interval = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      countdownScreen.textContent = countdown;
    } else if (countdown === 0) {
      countdownScreen.textContent = "GO!";
      countdownScreen.style.color = 'var(--color-primary)';
    } else {
      clearInterval(interval);
      countdownScreen.style.display = 'none';
      startGame();
    }
  }, 1000);
}

// Start Game loop
function startGame() {
  // Load Puzzle Image
  if (gameData.image.url === 'fallback') {
    imageLoaded = true;
    isGameActive = true;
    startTime = Date.now();
    renderAllBoards();
    addBattleLog('Battle started! Let the race begin!');
  } else {
    gameImage.src = gameData.image.url;
    gameImage.onload = () => {
      imageLoaded = true;
      isGameActive = true;
      startTime = Date.now();
      renderAllBoards();
      addBattleLog('Battle started! Let the race begin!');
    };
    gameImage.onerror = () => {
      showToast('Failed to load puzzle image asset.', 'error');
      imageLoaded = false;
      isGameActive = true;
      startTime = Date.now();
      renderAllBoards();
    };
  }
  
  // Bind controls
  playerCanvas.addEventListener('click', handleBoardClick);
}

// Stop Game loop
function endGame() {
  isGameActive = false;
  playerCanvas.removeEventListener('click', handleBoardClick);
}

// Render player and opponent boards
function renderAllBoards() {
  renderCanvas(playerCanvas, playerCtx, playerGrid);
  opponentsMap.forEach((opp) => {
    renderCanvas(opp.canvas, opp.ctx, opp.grid);
  });
}

// Render standard puzzle grid onto target canvas context
function renderCanvas(canvas, ctx, grid) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Calculate if this particular grid is completely solved
  const isSolved = grid.every((tile, idx) => tile === idx);
  
  for (let i = 0; i < 9; i++) {
    const tileIdx = grid[i];
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = col * TILE_SIZE;
    const y = row * TILE_SIZE;
    
    // Draw sliding tiles (hide the empty slot 8, unless solved)
    if (tileIdx === 8 && !isSolved) {
      ctx.fillStyle = '#070710';
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
      continue;
    }
    
    if (imageLoaded) {
      const srcCol = tileIdx % 3;
      const srcRow = Math.floor(tileIdx / 3);
      const srcX = srcCol * (gameImage.width / 3);
      const srcY = srcRow * (gameImage.height / 3);
      const srcW = gameImage.width / 3;
      const srcH = gameImage.height / 3;
      
      ctx.drawImage(gameImage, srcX, srcY, srcW, srcH, x, y, TILE_SIZE, TILE_SIZE);
    } else {
      ctx.fillStyle = `hsl(${tileIdx * 40}, 60%, 45%)`;
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px Outfit';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tileIdx + 1, x + TILE_SIZE/2, y + TILE_SIZE/2);
    }
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
  }
  
  if (isSolved) {
    canvas.classList.add('completed');
  } else {
    canvas.classList.remove('completed');
  }
}

// Click inputs mapping
function handleBoardClick(e) {
  if (!isGameActive) return;
  
  const rect = playerCanvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;
  
  const clickedCol = Math.floor(clickX / (rect.width / 3));
  const clickedRow = Math.floor(clickY / (rect.height / 3));
  const clickedIdx = clickedRow * 3 + clickedCol;
  
  const emptyIdx = playerGrid.indexOf(8);
  
  const rowClicked = Math.floor(clickedIdx / 3);
  const colClicked = clickedIdx % 3;
  const rowEmpty = Math.floor(emptyIdx / 3);
  const colEmpty = emptyIdx % 3;
  
  const isAdjacent = (Math.abs(rowClicked - rowEmpty) === 1 && colClicked === colEmpty) ||
                     (Math.abs(colClicked - colEmpty) === 1 && rowClicked === rowEmpty);
                     
  if (isAdjacent) {
    playerGrid[emptyIdx] = playerGrid[clickedIdx];
    playerGrid[clickedIdx] = 8;
    
    movesCount++;
    document.getElementById('moves-val').textContent = movesCount;
    
    renderCanvas(playerCanvas, playerCtx, playerGrid);
    
    const currentProgress = getProgressPercentage(playerGrid);
    updateProgressUI('me', currentProgress);
    
    socket.emit('game-progress', {
      roomId: gameData.roomId,
      progress: currentProgress,
      grid: playerGrid
    });
    
    if (currentProgress === 100) {
      isGameActive = false;
      addBattleLog('You solved the puzzle! Sending score...');
      socket.emit('game-solved', { roomId: gameData.roomId });
    }
  }
}

// Efficacy progress calculations (0 - 100%)
function getProgressPercentage(grid) {
  let correctTiles = 0;
  for (let i = 0; i < 9; i++) {
    if (grid[i] === i) {
      correctTiles++;
    }
  }
  return Math.round((correctTiles / 9) * 100);
}

// Update client progress interface
function updateProgressUI(playerType, progress) {
  if (playerType === 'me') {
    document.getElementById('player-progress-pct').textContent = `${progress}%`;
    document.getElementById('player-progress-bar').style.width = `${progress}%`;
  }
}

// Append messages to log feeds
function addBattleLog(text) {
  const container = document.getElementById('battle-feed');
  const log = document.createElement('div');
  log.textContent = `• ${text}`;
  container.appendChild(log);
  container.scrollTop = container.scrollHeight;
}

// Run loader
window.addEventListener('DOMContentLoaded', loadGameData);
