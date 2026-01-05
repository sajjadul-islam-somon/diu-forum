/**
 * DIU Forum AI Chatbot
 * Secure, privacy-focused chatbot that only appears for logged-in users
 * Uses Google's Gemini 2.0 Flash model via Vercel serverless function
 */

class DIUChatbot {
  constructor() {
    this.isOpen = false;
    this.messages = [];
    this.isLoading = false;
    this.user = null;
    
    // Suggestions for first-time users
    this.suggestions = [
      "Tell me about scholarship opportunities",
      "How do I find jobs?",
      "What's the latest in DIU Forum?"
    ];
  }

  /**
   * Initialize the chatbot
   * Only renders UI if user is logged in
   */
  async init() {
    // ==========================================
    // PRIVACY CHECK: Only show for logged-in users
    // ==========================================
    const isLoggedIn = await this.checkAuth();
    
    if (!isLoggedIn) {
      console.log('[DIU Chatbot] User not logged in. Chatbot hidden.');
      return; // Do NOT render anything
    }

    console.log('[DIU Chatbot] User authenticated. Initializing chatbot...');
    
    // Load conversation history from sessionStorage
    this.loadHistory();
    
    // Render the UI
    this.render();
    this.attachEventListeners();
  }

  /**
   * Check if user is authenticated
   * Checks both Supabase session and localStorage
   */
  async checkAuth() {
    // Method 1: Check Supabase session
    if (window.supabaseClient) {
      try {
        const { data, error } = await window.supabaseClient.auth.getSession();
        if (!error && data?.session?.user) {
          this.user = data.session.user;
          return true;
        }
      } catch (err) {
        console.warn('[DIU Chatbot] Supabase auth check failed:', err);
      }
    }

    // Method 2: Check localStorage (fallback)
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

  /**
   * Load conversation history from sessionStorage
   */
  loadHistory() {
    try {
      const stored = sessionStorage.getItem('diu_chatbot_history');
      if (stored) {
        this.messages = JSON.parse(stored);
      }
    } catch (err) {
      console.warn('[DIU Chatbot] Failed to load history:', err);
      this.messages = [];
    }
  }

  /**
   * Save conversation history to sessionStorage
   */
  saveHistory() {
    try {
      sessionStorage.setItem('diu_chatbot_history', JSON.stringify(this.messages));
    } catch (err) {
      console.warn('[DIU Chatbot] Failed to save history:', err);
    }
  }

  /**
   * Render the chatbot UI
   */
  render() {
    // Create floating button
    const button = document.createElement('button');
    button.className = 'diu-chatbot-button';
    button.setAttribute('aria-label', 'Open AI Chatbot');
    button.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
        <path d="M7 9h10v2H7zm0-3h10v2H7zm0 6h7v2H7z"/>
      </svg>
    `;

    // Create chat window
    const window = document.createElement('div');
    window.className = 'diu-chatbot-window';
    window.innerHTML = `
      <div class="diu-chatbot-header">
        <div class="diu-chatbot-header-content">
          <div class="diu-chatbot-avatar">🤖</div>
          <div>
            <h3 class="diu-chatbot-header-title">DIU AI Assistant</h3>
            <p class="diu-chatbot-header-status">
              <span class="diu-chatbot-status-indicator"></span>
              Online
            </p>
          </div>
        </div>
        <button class="diu-chatbot-close" aria-label="Close chatbot">&times;</button>
      </div>
      
      <div class="diu-chatbot-messages" id="diu-chatbot-messages">
        ${this.messages.length === 0 ? this.renderWelcome() : this.renderMessages()}
      </div>
      
      <div class="diu-chatbot-input-area">
        <textarea 
          class="diu-chatbot-input" 
          id="diu-chatbot-input"
          placeholder="Ask me anything..."
          rows="1"
          maxlength="1000"
        ></textarea>
        <button class="diu-chatbot-send" id="diu-chatbot-send" aria-label="Send message">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
    `;

    // Add to DOM
    document.body.appendChild(button);
    document.body.appendChild(window);

    // Store references
    this.button = button;
    this.window = window;
    this.messagesContainer = document.getElementById('diu-chatbot-messages');
    this.input = document.getElementById('diu-chatbot-input');
    this.sendButton = document.getElementById('diu-chatbot-send');
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Toggle chat window
    this.button.addEventListener('click', () => this.toggle());
    
    // Close button
    this.window.querySelector('.diu-chatbot-close').addEventListener('click', () => this.close());
    
    // Send message on button click
    this.sendButton.addEventListener('click', () => this.sendMessage());
    
    // Send message on Enter (but allow Shift+Enter for new line)
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Auto-resize textarea
    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto';
      this.input.style.height = Math.min(this.input.scrollHeight, 120) + 'px';
    });

    // Suggestion buttons
    this.messagesContainer.querySelectorAll('.diu-chatbot-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        this.input.value = btn.textContent;
        this.sendMessage();
      });
    });
  }

  /**
   * Toggle chat window open/close
   */
  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Open chat window
   */
  open() {
    this.isOpen = true;
    this.window.classList.add('active');
    this.input.focus();
  }

  /**
   * Close chat window
   */
  close() {
    this.isOpen = false;
    this.window.classList.remove('active');
  }

  /**
   * Render welcome message with suggestions
   */
  renderWelcome() {
    const userName = this.user?.name || this.user?.email?.split('@')[0] || 'there';
    return `
      <div class="diu-chatbot-welcome">
        <h3>👋 Hi ${this.escapeHtml(userName)}!</h3>
        <p>I'm your AI assistant for DIU Forum. I can help you find scholarships, jobs, and answer questions about the platform.</p>
        <div class="diu-chatbot-suggestions">
          ${this.suggestions.map(s => `<button class="diu-chatbot-suggestion">${this.escapeHtml(s)}</button>`).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render all messages
   */
  renderMessages() {
    return this.messages
      .map(msg => this.renderMessage(msg))
      .join('');
  }

  /**
   * Render a single message
   */
  renderMessage(message) {
    const isUser = message.role === 'user';
    const avatar = isUser 
      ? (this.user?.name?.[0]?.toUpperCase() || 'U')
      : '🤖';
    
    return `
      <div class="diu-chatbot-message ${message.role}${message.error ? ' error' : ''}">
        <div class="diu-chatbot-message-avatar">${this.escapeHtml(avatar)}</div>
        <div class="diu-chatbot-message-content">${this.escapeHtml(message.content)}</div>
      </div>
    `;
  }

  /**
   * Render typing indicator
   */
  renderTyping() {
    return `
      <div class="diu-chatbot-message bot">
        <div class="diu-chatbot-message-avatar">🤖</div>
        <div class="diu-chatbot-typing">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    `;
  }

  /**
   * Send a message to the AI
   */
  async sendMessage() {
    const message = this.input.value.trim();
    
    if (!message || this.isLoading) return;

    // Add user message
    this.addMessage('user', message);
    this.input.value = '';
    this.input.style.height = 'auto';

    // Show typing indicator
    this.isLoading = true;
    this.sendButton.disabled = true;
    this.messagesContainer.insertAdjacentHTML('beforeend', this.renderTyping());
    this.scrollToBottom();

    try {
      // Call Vercel serverless function
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: message,
          history: this.messages.slice(-10) // Send last 10 messages for context
        })
      });

      // Remove typing indicator
      const typingIndicator = this.messagesContainer.querySelector('.diu-chatbot-typing');
      if (typingIndicator) {
        typingIndicator.closest('.diu-chatbot-message').remove();
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Add AI response
      this.addMessage('assistant', data.reply);

    } catch (error) {
      console.error('[DIU Chatbot] Error:', error);
      
      // Remove typing indicator
      const typingIndicator = this.messagesContainer.querySelector('.diu-chatbot-typing');
      if (typingIndicator) {
        typingIndicator.closest('.diu-chatbot-message').remove();
      }

      // Show error message
      this.addMessage('assistant', 'Sorry, I encountered an error. Please try again.', true);
    } finally {
      this.isLoading = false;
      this.sendButton.disabled = false;
      this.input.focus();
    }
  }

  /**
   * Add a message to the conversation
   */
  addMessage(role, content, isError = false) {
    const message = { role, content, timestamp: Date.now(), error: isError };
    this.messages.push(message);
    
    // Update UI
    const messagesHtml = this.renderMessages();
    this.messagesContainer.innerHTML = messagesHtml;
    
    // Re-attach suggestion listeners if welcome screen
    if (this.messages.length <= 1) {
      this.messagesContainer.querySelectorAll('.diu-chatbot-suggestion').forEach(btn => {
        btn.addEventListener('click', () => {
          this.input.value = btn.textContent;
          this.sendMessage();
        });
      });
    }
    
    // Save and scroll
    this.saveHistory();
    this.scrollToBottom();
  }

  /**
   * Scroll messages to bottom
   */
  scrollToBottom() {
    setTimeout(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }, 100);
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.messages = [];
    this.saveHistory();
    this.messagesContainer.innerHTML = this.renderWelcome();
    
    // Re-attach suggestion listeners
    this.messagesContainer.querySelectorAll('.diu-chatbot-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        this.input.value = btn.textContent;
        this.sendMessage();
      });
    });
  }
}

// ==========================================
// Auto-initialize when DOM is ready
// ==========================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.diuChatbot = new DIUChatbot();
    window.diuChatbot.init();
  });
} else {
  window.diuChatbot = new DIUChatbot();
  window.diuChatbot.init();
}

// ==========================================
// Clear history on logout
// ==========================================
window.addEventListener('storage', (e) => {
  if (e.key === 'user_info' && !e.newValue && window.diuChatbot) {
    console.log('[DIU Chatbot] User logged out. Clearing history.');
    window.diuChatbot.clearHistory();
  }
});
