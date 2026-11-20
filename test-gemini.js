const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const keyMatch = env.match(/GEMINI_API_KEY=([^\r\n]+)/);
const apiKey = keyMatch[1].trim();

const client = new GoogleGenAI({ apiKey });

async function run() {
  const t0 = Date.now();
  console.log('Sending message to gemini-3.1-flash-lite...');
  const chat = client.chats.create({
    model: 'gemini-3.1-flash-lite',
    config: {
      temperature: 0.2,
      maxOutputTokens: 2048,
    }
  });

  const res = await chat.sendMessage({
    message: 'Create a 5-day Sri Lanka itinerary from Colombo to Kandy to Bentota. Return valid JSON only with keys: message, documentContent.'
  });

  console.log(`SUCCESS in ${Date.now() - t0}ms!`);
  console.log('Response preview:', res.text.substring(0, 300));
}

run().catch(err => console.error('FAILED:', err));
