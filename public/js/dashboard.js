// Live Dashboard Script
// API_URL and SOCKET_PATH are loaded from config.js
let socket = null;

// Initial Load
async function fetchDashboardData() {
  try {
    const res = await fetch(`${API_URL}/picmix/api/dashboard/leaderboard`);
    const data = await res.json();
    
    if (data.success) {
      renderLeaderboard(data.leaderboard);
      renderRecentMatches(data.recentMatches);
    }
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
  }
}

// Connect to socket.io for real-time dashboard events
function initDashboardSocket() {
  socket = io(BACKEND_URL, { path: SOCKET_PATH });
  
  socket.on('connect', () => {
    console.log('Dashboard connected to live socket server.');
    socket.emit('get-dashboard-data'); // Request complete initial state
  });
  
  // Entire dashboard dataset update trigger (from finished matches)
  socket.on('dashboard-data', (data) => {
    renderLeaderboard(data.leaderboard);
    renderRecentMatches(data.recentMatches);
    updateServerStats(data.stats);
    renderActiveGames(data.activeGames);
  });
  
  // Real-time server count stats updates
  socket.on('dashboard-stats-update', (stats) => {
    updateServerStats(stats);
  });
  
  // Live active rooms sync (players moving tiles)
  socket.on('dashboard-games-update', (rooms) => {
    renderActiveGames(rooms);
  });
  
  // Finished matches reload trigger
  socket.on('dashboard-update', () => {
    fetchDashboardData();
  });
}

// Render player standings
function renderLeaderboard(scores) {
  const tbody = document.getElementById('leaderboard-body');
  tbody.innerHTML = '';
  
  if (!scores || scores.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No records available yet. Play matches to rank up!</td></tr>`;
    return;
  }
  
  scores.forEach((player, index) => {
    const tr = document.createElement('tr');
    
    // Determine rank styling
    const rank = index + 1;
    let rankBadge = `<span class="rank-badge">${rank}</span>`;
    if (rank === 1) rankBadge = `<span class="rank-badge rank-1">🥇</span>`;
    if (rank === 2) rankBadge = `<span class="rank-badge rank-2">🥈</span>`;
    if (rank === 3) rankBadge = `<span class="rank-badge rank-3">🥉</span>`;
    
    // Winrate calculations
    const winRate = player.gamesPlayed > 0 
      ? Math.round((player.wins / player.gamesPlayed) * 100) 
      : 0;
      
    tr.innerHTML = `
      <td>${rankBadge}</td>
      <td style="font-weight: bold;">${player.username}</td>
      <td>
        <span style="color: ${winRate >= 50 ? 'var(--color-cyan)' : 'var(--text-muted)'}; font-weight: 600;">
          ${winRate}%
        </span>
      </td>
      <td>${player.wins} W / ${player.losses} L</td>
      <td><strong style="color: var(--color-primary);">${player.rankPoints}</strong></td>
    `;
    
    tbody.appendChild(tr);
  });
}

// Render active in-game matches
function renderActiveGames(rooms) {
  const container = document.getElementById('active-rooms-container');
  container.innerHTML = '';
  
  if (!rooms || rooms.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px;">No active matches in progress. Launch PicMix and hit "Find Battle" to start one!</p>`;
    return;
  }
  
  rooms.forEach(room => {
    const card = document.createElement('div');
    card.className = 'glass-panel';
    card.style.padding = '20px';
    card.style.border = '1px solid rgba(255, 255, 255, 0.05)';
    card.style.background = 'rgba(0, 0, 0, 0.2)';
    
    // Calculate display time
    const min = Math.floor(room.elapsedSec / 60).toString().padStart(2, '0');
    const sec = (room.elapsedSec % 60).toString().padStart(2, '0');
    
    // Generate opponent VS labels
    const playerNames = room.players.map(p => p.username).join(' vs ');
    
    // Render progress bar list for all players in room
    let playersHtml = '';
    room.players.forEach((p, idx) => {
      // Use different color styles to distinguish players
      const isEven = idx % 2 === 0;
      const colorClass = isEven ? 'me' : 'opponent';
      playersHtml += `
        <div style="margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 3px;">
            <span>${p.username} Progress:</span>
            <strong>${p.progress}%</strong>
          </div>
          <div class="progress-bar-container" style="height: 6px;">
            <div class="progress-fill ${colorClass}" style="width: ${p.progress}%"></div>
          </div>
        </div>
      `;
    });
    
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; margin-bottom: 12px; font-family: var(--font-display);">
        <div style="max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <strong>${playerNames}</strong>
        </div>
        <div style="font-size: 0.8rem; color: var(--color-cyan); font-weight: bold;">
          ⏱️ Running: ${min}:${sec}
        </div>
      </div>
      
      <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;">
        Puzzle: <strong>${room.image.name}</strong>
      </div>
      
      ${playersHtml}
    `;
    
    container.appendChild(card);
  });
}

// Render historic matches log
function renderRecentMatches(matches) {
  const container = document.getElementById('recent-matches-container');
  container.innerHTML = '';
  
  if (!matches || matches.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px;">No match logs recorded yet.</p>`;
    return;
  }
  
  matches.forEach(match => {
    const item = document.createElement('div');
    item.className = 'recent-match-item';
    
    // Parse time
    const date = new Date(match.playedAt);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    item.innerHTML = `
      <div>
        <span class="winner-name">🏆 ${match.winner}</span>
        <span style="color: var(--text-muted); font-size: 0.85rem;"> defeated </span>
        <span class="loser-name">${match.loser}</span>
      </div>
      <div style="font-size: 0.75rem; color: var(--text-muted);">${timeStr}</div>
    `;
    container.appendChild(item);
  });
}

// Server stats card loader
function updateServerStats(stats) {
  document.getElementById('stats-online').textContent = stats.online;
  document.getElementById('stats-queue').textContent = stats.inQueue;
  // stats.inGame represents total players in-game, so room count is stats.inGame / 2
  document.getElementById('stats-active').textContent = Math.round(stats.inGame / 2);
}

// Start listeners
window.addEventListener('DOMContentLoaded', () => {
  fetchDashboardData();
  initDashboardSocket();
});
