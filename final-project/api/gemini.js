export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method Not Allowed' } });
  }

  const apiKey = process.env.CHATBOT_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: { message: 'Missing CHATBOT_API_KEY in Vercel Environment Variables. Add it, then redeploy.' }
    });
  }

  // req.body can arrive as a string depending on the content type
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const { model, payload } = body || {};
  if (!payload) {
    return res.status(400).json({ error: { message: 'Missing payload.' } });
  }

  const targetModel = model || 'gemini-2.5-flash';

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(targetModel)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json().catch(() => ({}));
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({
      error: { message: error.message || 'Server error connecting to Gemini.' }
    });
  }
}