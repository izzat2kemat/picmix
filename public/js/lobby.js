// Lobby Socket & Matchmaking Handling
let socket = null;
let isSearching = false;

// Initialize socket connections
function initSocketConnection(token) {
  if (socket) return; // Prevent double initialization
  
  socket = io(BACKEND_URL, { path: SOCKET_PATH });
  
  // Authenticate socket on connection
  socket.on('connect', () => {
    socket.emit('auth', token);
  });
  
  socket.on('authenticated', (user) => {
    console.log('Socket authenticated as', user.username);
  });
  
  socket.on('auth-failed', (msg) => {
    showToast(`Authentication failed: ${msg}`, 'error');
    localStorage.removeItem('token');
    location.reload();
  });
  
  // Matchmaking events
  socket.on('waiting-for-match', () => {
    isSearching = true;
    document.getElementById('matchmaking-modal').style.display = 'flex';
  });
  
  socket.on('queue-left', () => {
    isSearching = false;
    document.getElementById('matchmaking-modal').style.display = 'none';
  });
  
  socket.on('matchmaking-queue-update', ({ count, players, countdown }) => {
    const queueStatus = document.getElementById('queue-status-text');
    const queueList = document.getElementById('queue-players-list');
    
    if (queueStatus) {
      if (countdown > 0) {
        queueStatus.innerHTML = `Gathering players... Match starts in <strong style="color: var(--color-cyan);">${countdown}s</strong>`;
      } else {
        queueStatus.innerHTML = `Searching for players... (${count} in queue)`;
      }
    }
    
    if (queueList) {
      queueList.innerHTML = players.join(', ');
    }
  });
  
  socket.on('game-init', (data) => {
    isSearching = false;
    document.getElementById('matchmaking-modal').style.display = 'none';
    showToast('Match found! Loading battle...', 'success');
    
    // Save game start configurations to sessionStorage
    sessionStorage.setItem('picmix_current_game', JSON.stringify(data));
    
    // Redirect to game screen after 1.5 seconds
    setTimeout(() => {
      window.location.href = `/game.html`;
    }, 1500);
  });
  
  // Dashboard / Server stats updates
  socket.on('dashboard-stats-update', (stats) => {
    document.getElementById('stat-online').textContent = stats.online;
    document.getElementById('stat-queue').textContent = stats.inQueue;
  });
  
  // Lobby Chat events
  socket.on('chat-message', (data) => {
    displayChatMessage(data.sender, data.text);
  });
  
  // Common error handling
  socket.on('error-msg', (msg) => {
    showToast(msg, 'error');
  });
}

// Trigger Matchmaking
document.getElementById('find-match-btn').addEventListener('click', () => {
  if (!socket) {
    showToast('Not connected to game server', 'error');
    return;
  }
  socket.emit('join-queue');
});

// Cancel Matchmaking
document.getElementById('cancel-match-btn').addEventListener('click', () => {
  if (socket && isSearching) {
    socket.emit('leave-queue');
  }
});

// Lobby Chat Form Submit
document.getElementById('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  
  if (text && socket) {
    socket.emit('lobby-chat-send', text); // We can handle this on the server
    input.value = '';
  }
});

// Helper to render chat message
function displayChatMessage(sender, text) {
  const container = document.getElementById('chat-messages');
  const msgEl = document.createElement('div');
  
  const token = localStorage.getItem('token');
  let currentUsername = "";
  if (token) {
    try {
      const decoded = JSON.parse(atob(token.split('.')[1]));
      currentUsername = decoded.username;
    } catch(e){}
  }
  
  const isMe = sender.toLowerCase() === currentUsername.toLowerCase();
  
  msgEl.innerHTML = `<strong style="color: ${isMe ? 'var(--color-primary)' : 'var(--color-secondary)'};">${sender}:</strong> ${text}`;
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
}

// Add Server Handler for lobby-chat-send inside server.js later if needed or write it locally.
// Wait! Let's verify if lobby chat messaging needs socket handling on server.
// Let's add the socket listener 'lobby-chat-send' to server.js since we just wrote it.
// Oh, did we include 'lobby-chat-send' in server.js? Let's check server.js content. We had:
// io.on('connection', ...) but did we have 'lobby-chat-send' hook?
// Ah! In server.js, we did not write the hook for `lobby-chat-send` explicitly, but it's very easy to add!
// Let's verify. Yes, we can add it to server.js easily. Let's make sure we do.
