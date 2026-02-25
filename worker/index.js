const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*';
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Health check
    if (url.pathname === '/api/health') {
      return new Response(
        JSON.stringify({ status: 'ok', model: MODEL }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
      );
    }

    // Chat endpoint
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      try {
        const { messages } = await request.json();

        const response = await fetch(OPENAI_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: MODEL,
            messages,
            max_tokens: 150,
            temperature: 0.9,
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          return new Response(
            JSON.stringify({ error: text }),
            { status: response.status, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
          );
        }

        const data = await response.json();
        return new Response(
          JSON.stringify({ message: { content: data.choices?.[0]?.message?.content || '...' } }),
          { headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: err.message }),
          { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } }
        );
      }
    }

    return new Response('Not found', { status: 404, headers: corsHeaders(origin) });
  },
};
