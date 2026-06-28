// Authentication Helper Logic
// API_URL is loaded from config.js

// Show Toast message
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast-container');
  const toastMsg = document.getElementById('toast-msg');
  
  toast.className = 'toast'; // reset classes
  if (type === 'error') toast.classList.add('error');
  if (type === 'success') toast.classList.add('success');
  
  toastMsg.textContent = msg;
  toast.classList.add('show');
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// Switch between Login and Register tabs
function switchAuthTab(tab) {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  
  if (tab === 'login') {
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
  } else {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    tabLogin.classList.remove('active');
    tabRegister.classList.add('active');
  }
}

// Handle login submissions
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  
  try {
    const res = await fetch(`${API_URL}/picmix/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    
    if (data.success) {
      localStorage.setItem('token', data.token);
      showToast('Logged in successfully!', 'success');
      checkAuthStatus();
    } else {
      showToast(data.message || 'Login failed', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Server connection failed', 'error');
  }
});

// Handle registration submissions
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('register-username').value;
  const password = document.getElementById('register-password').value;
  
  try {
    const res = await fetch(`${API_URL}/picmix/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    
    if (data.success) {
      localStorage.setItem('token', data.token);
      showToast('Account registered and logged in!', 'success');
      checkAuthStatus();
    } else {
      showToast(data.message || 'Registration failed', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Server connection failed', 'error');
  }
});

// Logout handler
document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('token');
  showToast('Logged out successfully', 'info');
  location.reload(); // refresh page to clear any in-memory socket connection
});

// Check if authenticated
async function checkAuthStatus() {
  const token = localStorage.getItem('token');
  const authView = document.getElementById('auth-view');
  const lobbyView = document.getElementById('lobby-view');
  
  if (!token) {
    authView.style.display = 'block';
    lobbyView.style.display = 'none';
    document.getElementById('logout-btn').style.display = 'none';
    document.getElementById('user-profile-badge').style.display = 'none';
    document.getElementById('admin-nav-link').style.display = 'none';
    return;
  }
  
  try {
    const res = await fetch(`${API_URL}/picmix/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await res.json();
    if (data.success) {
      // Set UI badge
      document.getElementById('user-badge-name').textContent = data.user.username;
      document.getElementById('user-avatar-char').textContent = data.user.username.charAt(0).toUpperCase();
      document.getElementById('user-profile-badge').style.display = 'flex';
      document.getElementById('logout-btn').style.display = 'inline-flex';
      
      // Update User Stats
      document.getElementById('user-points').textContent = `${data.stats.rankPoints} ELO`;
      document.getElementById('user-games').textContent = data.stats.gamesPlayed;
      document.getElementById('user-wins').textContent = data.stats.wins;
      document.getElementById('user-losses').textContent = data.stats.losses;
      
      // Show admin option if admin
      if (data.user.isAdmin) {
        document.getElementById('admin-nav-link').style.display = 'inline-flex';
      } else {
        document.getElementById('admin-nav-link').style.display = 'none';
      }
      
      authView.style.display = 'none';
      lobbyView.style.display = 'grid';
      
      // Initialize Multiplayer Socket
      initSocketConnection(token);
      loadPuzzleImages();
    } else {
      localStorage.removeItem('token');
      authView.style.display = 'block';
      lobbyView.style.display = 'none';
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to connect to authentication server', 'error');
  }
}

// Load images onto lobby gallery
async function loadPuzzleImages() {
  try {
    const res = await fetch(`${API_URL}/picmix/api/images`);
    const data = await res.json();
    
    if (data.success && data.images) {
      const gallery = document.getElementById('image-gallery');
      gallery.innerHTML = '';
      
      data.images.forEach(img => {
        const card = document.createElement('div');
        card.className = 'image-card';
        card.innerHTML = `
          <img src="${img.url}" alt="${img.name}">
          <div class="card-overlay">${img.name}</div>
        `;
        gallery.appendChild(card);
      });
    }
  } catch (err) {
    console.error('Failed to load images gallery', err);
  }
}

// Run auth check on load
window.addEventListener('DOMContentLoaded', checkAuthStatus);
