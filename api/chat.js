import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

export default async function handler(req, res) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'Invalid prompt' });
    }

    if (!process.env.GOOGLE_API_KEY) {
      console.error('GOOGLE_API_KEY not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Use Vercel AI SDK with Gemini 2.5 Flash Lite
    const { text } = await generateText({
      model: google('gemini-2.5-flash-lite'),
      prompt: prompt.trim(),
      apiKey: process.env.GOOGLE_API_KEY,
    });

    return res.status(200).json({ reply: text });

  } catch (error) {
    console.error('Chat API error:', error);
    return res.status(500).json({ error: 'Failed to generate response' });
  }
}
