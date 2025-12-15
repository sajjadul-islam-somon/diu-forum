// chatbot.js - Production-Ready AI Chatbot Component for Vercel Deployment
// Uses ES6 Class Pattern for reusability across multiple pages

class ChatBot {
    constructor(agentType, systemPrompt) {
        this.agentType = agentType; // 'studies', 'jobs', 'admin'
        this.systemPrompt = systemPrompt;
        this.conversationHistory = [];
        this.isOpen = false;
        this.title = 'AI Assistant';
        this.subtitle = 'Online';
        this.welcomeMessage = 'Hello! How can I help you today?';
        
        this.init();
    }

    init() {
        this.createUI();
        this.attachEventListeners();
        this.loadHistory();
        this.setupLogoutListener();
    }

    createUI() {
        // Create floating chat icon button
        const icon = document.createElement('button');
        icon.id = 'chatbot-icon';
        icon.className = 'chatbot-icon';
        icon.innerHTML = '💬';
        icon.setAttribute('aria-label', 'Open AI Chat');
        document.body.appendChild(icon);

        // Create modal overlay and container
        const overlay = document.createElement('div');
        overlay.id = 'chatbot-overlay';
        overlay.className = 'chatbot-overlay';
        document.body.appendChild(overlay);

        const modal = document.createElement('div');
        modal.id = 'chatbot-modal';
        modal.className = 'chatbot-modal';
        modal.innerHTML = `
            <div class="chatbot-header">
                <div class="chatbot-header-info">
                    <h3 id="chatbot-title">${this.title}</h3>
                    <span class="chatbot-status">
                        <span class="status-dot"></span>
                        <span id="chatbot-subtitle">${this.subtitle}</span>
                    </span>
                </div>
                <button id="chatbot-close" class="chatbot-close" aria-label="Close chat">&times;</button>
            </div>
            <div id="chatbot-messages" class="chatbot-messages">
                <div class="bot-message">${this.welcomeMessage}</div>
            </div>
            <form id="chatbot-form" class="chatbot-input-area">
                <input 
                    type="text" 
                    id="chatbot-input" 
                    class="chatbot-input" 
                    placeholder="Type your message..." 
                    autocomplete="off"
                    required
                />
                <button type="submit" class="chatbot-send-btn" aria-label="Send message">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M2 10L18 2L12 10L18 18L2 10Z" fill="currentColor"/>
                    </svg>
                </button>
            </form>
        `;
        document.body.appendChild(modal);
    }

    attachEventListeners() {
        const icon = document.getElementById('chatbot-icon');
        const overlay = document.getElementById('chatbot-overlay');
        const closeBtn = document.getElementById('chatbot-close');
        const form = document.getElementById('chatbot-form');

        icon.addEventListener('click', () => this.toggleChat());
        overlay.addEventListener('click', () => this.closeChat());
        closeBtn.addEventListener('click', () => this.closeChat());
        form.addEventListener('submit', (e) => this.handleSubmit(e));

        // Close on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.closeChat();
            }
        });
    }

    toggleChat() {
        this.isOpen ? this.closeChat() : this.openChat();
    }

    openChat() {
        const modal = document.getElementById('chatbot-modal');
        const overlay = document.getElementById('chatbot-overlay');
        const icon = document.getElementById('chatbot-icon');
        const input = document.getElementById('chatbot-input');

        modal.classList.add('active');
        overlay.classList.add('active');
        icon.style.display = 'none';
        this.isOpen = true;

        // Focus input after animation
        setTimeout(() => input.focus(), 300);
    }

    closeChat() {
        const modal = document.getElementById('chatbot-modal');
        const overlay = document.getElementById('chatbot-overlay');
        const icon = document.getElementById('chatbot-icon');

        modal.classList.remove('active');
        overlay.classList.remove('active');
        icon.style.display = 'flex';
        this.isOpen = false;
    }

    async handleSubmit(e) {
        e.preventDefault();

        const input = document.getElementById('chatbot-input');
        const userMessage = input.value.trim();

        if (!userMessage) return;

        // Add user message to UI
        this.addMessage(userMessage, 'user');
        input.value = '';

        // Add to conversation history
        this.conversationHistory.push({ role: 'user', content: userMessage });
        this.saveHistory();

        // Show loading indicator
        this.addLoadingMessage();

        try {
            // Call AI API
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: this.buildPrompt(userMessage),
                    agentType: this.agentType,
                    history: this.conversationHistory
                })
            });

            if (!response.ok) {
                throw new Error('Failed to get AI response');
            }

            const data = await response.json();
            const aiReply = data.reply || "Sorry, I couldn't process that.";

            // Remove loading indicator
            this.removeLoadingMessage();

            // Add AI response to UI
            this.addMessage(aiReply, 'bot');

            // Add to conversation history
            this.conversationHistory.push({ role: 'bot', content: aiReply });
            this.saveHistory();

        } catch (error) {
            console.error('Chatbot error:', error);
            this.removeLoadingMessage();
            this.addMessage('Sorry, I encountered an error. Please try again.', 'bot', true);
        }
    }

    buildPrompt(userMessage) {
        // Combine system prompt with conversation context
        let fullPrompt = `${this.systemPrompt}\n\n`;
        
        // Add recent conversation history (last 5 exchanges)
        const recentHistory = this.conversationHistory.slice(-10);
        if (recentHistory.length > 0) {
            fullPrompt += "Previous conversation:\n";
            recentHistory.forEach(msg => {
                fullPrompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
            });
            fullPrompt += "\n";
        }

        fullPrompt += `User: ${userMessage}\nAssistant:`;
        return fullPrompt;
    }

    addMessage(content, role, isError = false) {
        const messagesContainer = document.getElementById('chatbot-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `${role}-message${isError ? ' error-message' : ''}`;
        
        // Simple text content (you can enhance with markdown rendering if needed)
        messageDiv.textContent = content;
        
        messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    addLoadingMessage() {
        const messagesContainer = document.getElementById('chatbot-messages');
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'loading-indicator';
        loadingDiv.className = 'bot-message typing-indicator';
        loadingDiv.innerHTML = '<span></span><span></span><span></span>';
        messagesContainer.appendChild(loadingDiv);
        this.scrollToBottom();
    }

    removeLoadingMessage() {
        const loadingDiv = document.getElementById('loading-indicator');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }

    scrollToBottom() {
        const messagesContainer = document.getElementById('chatbot-messages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    saveHistory() {
        const key = `chatbot_history_${this.agentType}`;
        sessionStorage.setItem(key, JSON.stringify(this.conversationHistory));
    }

    loadHistory() {
        const key = `chatbot_history_${this.agentType}`;
        const saved = sessionStorage.getItem(key);
        if (saved) {
            try {
                this.conversationHistory = JSON.parse(saved);
                // Restore messages to UI
                this.conversationHistory.forEach(msg => {
                    this.addMessage(msg.content, msg.role);
                });
            } catch (e) {
                console.error('Failed to load chat history', e);
            }
        }
    }

    clearHistory() {
        const key = `chatbot_history_${this.agentType}`;
        sessionStorage.removeItem(key);
        this.conversationHistory = [];
        
        // Clear UI messages except welcome
        const messagesContainer = document.getElementById('chatbot-messages');
        messagesContainer.innerHTML = `<div class="bot-message">${this.welcomeMessage}</div>`;
    }

    setupLogoutListener() {
        // Listen for logout events to clear history
        window.addEventListener('auth-ready', (e) => {
            if (!e.detail || !e.detail.user) {
                this.clearHistory();
            }
        });

        // Also listen for explicit logout button clicks
        document.addEventListener('click', (e) => {
            if (e.target.id === 'logoutBtn' || e.target.closest('#logoutBtn')) {
                this.clearHistory();
            }
        });
    }

    // Customization methods
    setTitle(title, subtitle = 'Online') {
        this.title = title;
        this.subtitle = subtitle;
        const titleEl = document.getElementById('chatbot-title');
        const subtitleEl = document.getElementById('chatbot-subtitle');
        if (titleEl) titleEl.textContent = title;
        if (subtitleEl) subtitleEl.textContent = subtitle;
    }

    setWelcomeMessage(message) {
        this.welcomeMessage = message;
    }
}

// Export to window for global access
window.ChatBot = ChatBot;
