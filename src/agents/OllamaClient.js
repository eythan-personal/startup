const API_URL = 'http://localhost:3001/api';

export class OllamaClient {
  static async chat(messages) {
    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.2',
          messages
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.message?.content || '...';
    } catch (err) {
      console.error('OllamaClient error:', err.message);
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
