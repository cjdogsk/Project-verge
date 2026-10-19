export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method Not Allowed' } });
  }

  const apiKey = process.env.CHATBOT_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: { message: 'Missing CHATBOT_API_KEY in Vercel Environment Variables.' }
    });
  }

  const { model, payload } = req.body || {};
  const targetModel = model || 'gemini-flash-latest';

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent`,
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