const DEV_URL = 'http://localhost:3001/api';
const PROD_URL = 'https://startup-ai-proxy.winter-lake-b4eb.workers.dev/api';

const API_URL = window.location.hostname === 'localhost' ? DEV_URL : PROD_URL;

export class AIClient {
  static async chat(messages, options = {}) {
    try {
      const body = { messages };
      if (options.max_tokens) body.max_tokens = options.max_tokens;

      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.message?.content || '...';
    } catch (err) {
      console.error('AI client error:', err.message);
      return null;
    }
  }

  static async checkHealth() {
    try {
      const response = await fetch(`${API_URL}/health`);
      const data = await response.json();
      return data.status === 'ok';
    } catch {
      return false;
    }
  }
}
