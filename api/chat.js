// api/chat.js - Vercel Serverless Function with ES Modules
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
    // Set CORS headers (if needed for cross-origin requests)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Extract prompt and optional history from request body
        const { prompt, history, agentType } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        // Check if API key exists
        if (!process.env.GOOGLE_API_KEY) {
            console.error('GOOGLE_API_KEY environment variable not set');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Initialize Google Generative AI
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        
        // Use gemini-1.5-pro (gemini-3-pro-preview doesn't exist yet)
        // Available models: gemini-1.5-pro, gemini-1.5-flash, gemini-pro
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-pro",
            generationConfig: {
                temperature: 0.7,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 2048,
            }
        });

        // Build conversation history if provided
        let conversationHistory = [];
        if (history && Array.isArray(history)) {
            conversationHistory = history.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }]
            }));
        }

        // Generate AI response
        const chat = model.startChat({
            history: conversationHistory,
            generationConfig: {
                maxOutputTokens: 2048,
            },
        });

        const result = await chat.sendMessage(prompt);
        const response = await result.response;
        const text = response.text();

        // Log for debugging (visible in Vercel logs)
        console.log(`[${agentType || 'unknown'}] AI request processed successfully`);

        // Return successful response
        return res.status(200).json({ 
            reply: text,
            agentType: agentType 
        });

    } catch (error) {
        console.error("Gemini API Error:", error.message);
        console.error("Error details:", error);
        
        return res.status(500).json({ 
            error: 'Failed to generate AI response',
            details: error.message 
        });
    }
}