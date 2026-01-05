/**
 * DIU Forum AI Chatbot
 * Professional chatbot with temporary history (no persistence)
 * Uses Google Gemini via Vercel serverless function
 */

class DIUChatbot {
  constructor() {
    this.isOpen = false;
    this.messages = []; // TEMPORARY - cleared on page refresh
    this.isLoading = false;
    this.user = null;
    
    this.suggestions = [
      "Tell me about scholarship opportunities",
      "How do I find jobs?",
      "What's new in DIU Forum?"
    ];
  }

  async init() {
    const isLoggedIn = await this.checkAuth();
    
    if (!isLoggedIn) {
      console.log('[DIU Chatbot] User not logged in. Chatbot hidden.');
      return;
    }

    console.log('[DIU Chatbot] User authenticated. Initializing...');
    this.render();
    this.attachEventListeners();
  }

  async checkAuth() {
    // Check Supabase session
    if (window.supabaseClient) {
      try {
        const { data, error } = await window.supabaseClient.auth.getSession();
        if (!error && data?.session?.user) {
          this.user = data.session.user;
          return true;
        }
      } catch (err) {
        console.warn('[DIU Chatbot] Supabase check failed:', err);
      }
    }

    // Check localStorage fallback
    try {
      const getter = window?.safeLocal?.getItem || localStorage.getItem.bind(localStorage);
      const userInfo = getter('user_info');
      
      if (userInfo) {
        const parsed = JSON.parse(userInfo);
        if (parsed?.email && parsed.email.endsWith('@diu.edu.bd')) {
          this.user = parsed;
          return true;
        }
      }
    } catch (err) {
      console.warn('[DIU Chatbot] localStorage check failed:', err);
    }

    return false;
  }

  render() {
    // Floating button with robot SVG
    const button = document.createElement('button');
    button.className = 'diu-chatbot-button';
    button.setAttribute('aria-label', 'Open AI Chatbot');
    button.innerHTML = `
      <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" class="robot-icon">
        <circle cx="32" cy="32" r="28" fill="white" opacity="0.2"/>
        <ellipse cx="32" cy="30" rx="20" ry="22" fill="white"/>
        <circle cx="24" cy="28" r="3" fill="#2563eb"/>
        <circle cx="40" cy="28" r="3" fill="#2563eb"/>
        <path d="M 22 38 Q 32 42 42 38" stroke="#2563eb" stroke-width="2" fill="none" stroke-linecap="round"/>
        <rect x="28" y="18" width="8" height="4" rx="2" fill="white" opacity="0.8"/>
        <line x1="32" y1="18" x2="32" y2="10" stroke="white" stroke-width="2" stroke-linecap="round"/>
        <circle cx="32" cy="8" r="3" fill="white"/>
      </svg>
    `;

    // Chat window
    const window = document.createElement('div');
    window.className = 'diu-chatbot-window';
    window.innerHTML = `
      <div class="diu-chatbot-header">
        <div class="diu-chatbot-header-left">
          <div class="diu-chatbot-avatar">
            <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="16" cy="15" rx="10" ry="11" fill="white"/>
              <circle cx="12" cy="14" r="1.5" fill="#2563eb"/>
              <circle cx="20" cy="14" r="1.5" fill="#2563eb"/>
              <path d="M 11 19 Q 16 21 21 19" stroke="#2563eb" stroke-width="1.5" fill="none"/>
            </svg>
          </div>
          <div>
            <h3 class="diu-chatbot-title">DIU AI Assistant</h3>
            <p class="diu-chatbot-status">
              <span class="status-dot"></span>Online
            </p>
          </div>
        </div>
        <button class="diu-chatbot-close" aria-label="Close">&times;</button>
      </div>
      
      <div class="diu-chatbot-messages" id="diu-chatbot-messages">
        ${this.renderWelcome()}
      </div>
      
      <div class="diu-chatbot-input-area">
        <textarea 
          class="diu-chatbot-input" 
          id="diu-chatbot-input"
          placeholder="Type your message..."
          rows="1"
          maxlength="1000"
        ></textarea>
        <button class="diu-chatbot-send" id="diu-chatbot-send" aria-label="Send">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
    `;

    document.body.appendChild(button);
    document.body.appendChild(window);

    this.button = button;
    this.window = window;
    this.messagesContainer = document.getElementById('diu-chatbot-messages');
    this.input = document.getElementById('diu-chatbot-input');
    this.sendButton = document.getElementById('diu-chatbot-send');
  }

  attachEventListeners() {
    this.button.addEventListener('click', () => this.toggle());
    this.window.querySelector('.diu-chatbot-close').addEventListener('click', () => this.close());
    this.sendButton.addEventListener('click', () => this.sendMessage());
    
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto';
      this.input.style.height = Math.min(this.input.scrollHeight, 100) + 'px';
    });

    this.messagesContainer.querySelectorAll('.diu-chatbot-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        this.input.value = btn.textContent;
        this.sendMessage();
      });
    });
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  open() {
    this.isOpen = true;
    this.window.classList.add('active');
    this.input.focus();
  }

  close() {
    this.isOpen = false;
    this.window.classList.remove('active');
  }

  renderWelcome() {
    const userName = this.user?.name || this.user?.email?.split('@')[0] || 'there';
    return `
      <div class="diu-chatbot-welcome">
        <div class="welcome-icon">👋</div>
        <h3>Hi ${this.escapeHtml(userName)}!</h3>
        <p>I'm your AI assistant for DIU Forum. Ask me about scholarships, jobs, or anything else!</p>
        <div class="diu-chatbot-suggestions">
          ${this.suggestions.map(s => `<button class="diu-chatbot-suggestion">${this.escapeHtml(s)}</button>`).join('')}
        </div>
      </div>
    `;
  }

  renderMessages() {
    return this.messages.map(msg => {
      const isUser = msg.role === 'user';
      const avatar = isUser 
        ? (this.user?.name?.[0]?.toUpperCase() || 'U')
        : `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><ellipse cx="12" cy="11" rx="7" ry="8" fill="currentColor"/><circle cx="9" cy="10" r="1" fill="white"/><circle cx="15" cy="10" r="1" fill="white"/><path d="M 8 14 Q 12 16 16 14" stroke="white" stroke-width="1" fill="none"/></svg>`;
      
      return `
        <div class="diu-chatbot-message ${msg.role}${msg.error ? ' error' : ''}">
          <div class="diu-chatbot-message-avatar">${isUser ? this.escapeHtml(avatar) : avatar}</div>
          <div class="diu-chatbot-message-bubble">${this.escapeHtml(msg.content)}</div>
        </div>
      `;
    }).join('');
  }

  renderTyping() {
    return `
      <div class="diu-chatbot-message bot typing-message">
        <div class="diu-chatbot-message-avatar">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="12" cy="11" rx="7" ry="8" fill="currentColor"/>
            <circle cx="9" cy="10" r="1" fill="white"/>
            <circle cx="15" cy="10" r="1" fill="white"/>
            <path d="M 8 14 Q 12 16 16 14" stroke="white" stroke-width="1" fill="none"/>
          </svg>
        </div>
        <div class="diu-chatbot-typing">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
  }

  async sendMessage() {
    const message = this.input.value.trim();
    
    if (!message || this.isLoading) return;

    // Add user message
    this.addMessage('user', message);
    this.input.value = '';
    this.input.style.height = 'auto';

    // SPAM PREVENTION: Disable input and button
    this.isLoading = true;
    this.input.disabled = true;
    this.sendButton.disabled = true;
    this.messagesContainer.insertAdjacentHTML('beforeend', this.renderTyping());
    this.scrollToBottom();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: message,
          history: this.messages.slice(-10)
        })
      });

      const typingIndicator = this.messagesContainer.querySelector('.typing-message');
      if (typingIndicator) typingIndicator.remove();

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error ${response.status}`);
      }

      const data = await response.json();
      this.addMessage('assistant', data.reply);

    } catch (error) {
      console.error('[DIU Chatbot] Error:', error);
      
      const typingIndicator = this.messagesContainer.querySelector('.typing-message');
      if (typingIndicator) typingIndicator.remove();
      
      this.addMessage('assistant', 'Sorry, something went wrong. Please try again.', true);
    } finally {
      // RE-ENABLE input and button
      this.isLoading = false;
      this.input.disabled = false;
      this.sendButton.disabled = false;
      this.input.focus();
    }
  }

  addMessage(role, content, isError = false) {
    this.messages.push({ role, content, error: isError });
    this.messagesContainer.innerHTML = this.renderMessages();
    
    if (this.messages.length === 1) {
      this.messagesContainer.querySelectorAll('.diu-chatbot-suggestion').forEach(btn => {
        btn.addEventListener('click', () => {
          this.input.value = btn.textContent;
          this.sendMessage();
        });
      });
    }
    
    this.scrollToBottom();
  }

  scrollToBottom() {
    setTimeout(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }, 50);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  clearHistory() {
    this.messages = [];
    this.messagesContainer.innerHTML = this.renderWelcome();
    this.messagesContainer.querySelectorAll('.diu-chatbot-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        this.input.value = btn.textContent;
        this.sendMessage();
      });
    });
  }
}

// Auto-initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.diuChatbot = new DIUChatbot();
    window.diuChatbot.init();
  });
} else {
  window.diuChatbot = new DIUChatbot();
  window.diuChatbot.init();
}

// Clear on logout
window.addEventListener('storage', (e) => {
  if (e.key === 'user_info' && !e.newValue && window.diuChatbot) {
    console.log('[DIU Chatbot] User logged out.');
    window.diuChatbot.clearHistory();
  }
});
