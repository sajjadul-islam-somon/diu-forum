# DIU Forum - AI Chatbot Integration

## 📁 File Structure for Vercel Deployment

Your project should have this structure:

```
diu-forum/
├── api/
│   └── chat.js              # ✅ Vercel Serverless Function (ES Modules)
├── package.json             # ✅ With "type": "module"
├── chatbot.js               # ✅ Frontend ChatBot class
├── chatbot.css              # ✅ Modern blue-themed styling
├── studies.html             # Your existing page
├── studies.js               # Your existing logic
├── jobs.html                # Your existing page
├── jobs.js                  # Your existing logic
├── admin.html               # Your existing page
├── admin.js                 # Your existing logic
└── ... (other files)
```

## 🚀 Deployment Steps

### 1. Set Environment Variable in Vercel

**CRITICAL:** Before deploying, add your Google API key as an environment variable:

1. Go to your Vercel Dashboard
2. Select your project → Settings → Environment Variables
3. Add: `GOOGLE_API_KEY` = `AIzaSyBCHMW9TMuBiCQQKnFb-FNRVM26JBLyLVE`
4. Save

### 2. Push to GitHub

```bash
git add .
git commit -m "Add AI chatbot integration with Gemini"
git push origin main
```

### 3. Vercel Auto-Deploy

Vercel will automatically:
- Detect `package.json` and install dependencies
- Build the serverless function at `/api/chat`
- Deploy your static HTML/JS/CSS files
- Set up routing

### 4. Test on Live URL

Once deployed, visit:
- `https://your-app.vercel.app/studies`
- `https://your-app.vercel.app/jobs`
- `https://your-app.vercel.app/admin`

Click the 💬 icon in the bottom-right corner to open the AI chatbot.

## 🎯 Integration Instructions

### For Studies Page (Already Done)

**studies.html:**
```html
<head>
    <link rel="stylesheet" href="chatbot.css">
</head>
<body>
    <!-- Your existing content -->
    
    <script src="chatbot.js"></script>
    <script src="studies.js"></script>
</body>
```

**studies.js** (add at the end):
```javascript
// Academic Assistant AI Chatbot
document.addEventListener('DOMContentLoaded', () => {
    if (typeof ChatBot !== 'undefined') {
        initAcademicAssistant();
    }
});

function initAcademicAssistant() {
    const systemPrompt = `You are the DIU Academic Assistant, an AI helper for students looking for scholarships, internships, and higher studies opportunities.

Your role:
- Answer questions about scholarships and deadlines
- Provide information about study opportunities
- Help students find relevant programs
- Be encouraging and supportive

Guidelines:
- Be concise and helpful
- Focus on academic opportunities
- Provide specific information when available`;

    const assistant = new ChatBot('studies', systemPrompt);
    assistant.setTitle('Academic Assistant', 'Online');
    assistant.setWelcomeMessage('Hello! I can help you with scholarships, internships, and study opportunities. What are you looking for?');
}
```

### For Jobs Page (Already Done)

Same pattern - add chatbot imports to `jobs.html` and initialization code to `jobs.js`.

### For Admin Page (Already Done)

Same pattern - add chatbot imports to `admin.html` and initialization code to `admin.js`.

## 🔧 API Endpoint

The serverless function is accessible at:
- Local: `http://localhost:3000/api/chat`
- Production: `https://your-app.vercel.app/api/chat`

**Request Format:**
```json
{
  "prompt": "Full prompt with system instructions + user message",
  "agentType": "studies",
  "history": [
    { "role": "user", "content": "Previous message" },
    { "role": "bot", "content": "Previous response" }
  ]
}
```

**Response Format:**
```json
{
  "reply": "AI generated response text",
  "agentType": "studies"
}
```

## 🎨 Features

✅ **3 Specialized AI Agents:**
- Academic Assistant (Studies page)
- Career Copilot (Jobs page)
- Content Guardian (Admin page)

✅ **Modern UI/UX:**
- Floating icon button (bottom-right)
- Smooth animations
- Responsive design
- Dark mode support

✅ **Smart Functionality:**
- Session-based chat history
- Auto-scroll to latest message
- Loading indicators
- Error handling
- History cleared on logout

✅ **Production-Ready:**
- ES Modules for Vercel
- Secure API key handling
- CORS support
- Error logging

## 🐛 Troubleshooting

### API Key Not Working
- Check Vercel environment variables
- Ensure variable name is exactly `GOOGLE_API_KEY`
- Redeploy after adding environment variable

### 405 Method Not Allowed
- Ensure `/api/chat.js` exists in your repo
- Check file has `export default async function handler(req, res)`
- Verify `package.json` has `"type": "module"`

### Chatbot Not Appearing
- Check browser console for errors
- Ensure `chatbot.css` is loaded
- Verify `chatbot.js` loads before your page script
- Check that `ChatBot` class is defined: `console.log(window.ChatBot)`

## 📝 Model Information

Currently using: **gemini-1.5-pro**

Available models:
- `gemini-1.5-pro` - Best quality (current)
- `gemini-1.5-flash` - Faster responses
- `gemini-pro` - Stable version

To change model, edit `api/chat.js` line 41:
```javascript
model: "gemini-1.5-flash"  // or "gemini-pro"
```

## 💡 Customization

### Change Colors
Edit CSS variables in `chatbot.css`:
```css
:root {
    --chatbot-primary: #2563eb;  /* Change to your brand color */
    --chatbot-secondary: #3b82f6;
}
```

### Change Position
Edit `chatbot.css`:
```css
.chatbot-icon {
    bottom: 24px;  /* Distance from bottom */
    right: 24px;   /* Distance from right */
}
```

### Custom System Prompts
Edit the `systemPrompt` in each page's initialization function.

## ✅ Pre-Deployment Checklist

- [ ] `GOOGLE_API_KEY` added to Vercel environment variables
- [ ] All 4 files created/updated (package.json, api/chat.js, chatbot.js, chatbot.css)
- [ ] Chatbot imports added to HTML files
- [ ] Initialization functions added to JS files
- [ ] Committed and pushed to GitHub
- [ ] Vercel deployment triggered
- [ ] Tested on live URL

## 🎉 You're Ready!

Push your code to GitHub, and Vercel will handle the rest. The AI chatbot will be live on your production URL!
