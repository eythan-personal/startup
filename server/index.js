import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = 'gpt-4o-mini';

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in .env file');
  process.exit(1);
}

app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 150,
        temperature: 0.9
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('OpenAI error:', text);
      return res.status(response.status).json({ error: text });
    }

    const data = await response.json();
    // Map OpenAI response format to match what the client expects
    res.json({
      message: {
        content: data.choices?.[0]?.message?.content || '...'
      }
    });
  } catch (err) {
    console.error('OpenAI proxy error:', err.message);
    res.status(502).json({ error: 'Could not reach OpenAI API' });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
    });
    if (response.ok) {
      res.json({ status: 'ok', model: MODEL });
    } else {
      res.json({ status: 'offline' });
    }
  } catch {
    res.json({ status: 'offline' });
  }
});

app.listen(PORT, () => {
  console.log(`Agent server running on http://localhost:${PORT}`);
  console.log(`Using OpenAI ${MODEL}`);
});
