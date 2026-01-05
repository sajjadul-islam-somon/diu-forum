import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Google Generative AI client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

export default async function handler(req, res) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { prompt, history = [] } = req.body;

    // Validate input
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'Invalid prompt. Please provide a non-empty string.' });
    }

    // Validate API key exists
    if (!process.env.GOOGLE_API_KEY) {
      console.error('GOOGLE_API_KEY environment variable is not set');
      return res.status(500).json({ error: 'Server configuration error. Please contact support.' });
    }

    // Initialize the model
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    // Build conversation history for context
    let conversationContext = '';
    if (Array.isArray(history) && history.length > 0) {
      conversationContext = history
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n') + '\n';
    }

    // Combine history with current prompt
    const fullPrompt = conversationContext + `User: ${prompt.trim()}`;

    // Generate response
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    // Return the AI response
    return res.status(200).json({
      reply: text,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in chat API:', error);
    
    // Handle specific error types
    if (error.message?.includes('API key')) {
      return res.status(500).json({ error: 'API key configuration error.' });
    }
    
    if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }

    // Generic error response
    return res.status(500).json({ 
      error: 'Failed to generate response. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
