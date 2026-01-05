import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

export default async function handler(req, res) {
  // 1. Handle CORS (So your frontend can talk to this backend)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 2. Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { prompt } = req.body;

    // 3. Use Vercel AI SDK to generate text
    const { text } = await generateText({
      model: google('gemini-1.5-flash'), // Vercel automatically finds your GOOGLE_API_KEY
      prompt: prompt,
    });

    // 4. Send response back to frontend
    return res.status(200).json({ reply: text });

  } catch (error) {
    console.error("Vercel AI SDK Error:", error);
    return res.status(500).json({ error: 'AI Error', details: error.message });
  }
}