const toggleBtn = document.getElementById('theme-toggle');
if (toggleBtn) {
  let dark = false;
  toggleBtn.addEventListener('click', () => {
    dark = !dark;
    toggleBtn.textContent = dark ? 'toggle_off' : 'toggle_on';
    document.body.classList.toggle('dark-mode', dark);
  });
}

// Intro loader 
window.addEventListener('load', () => {
  const name = document.querySelector('.name');
  const intro = document.querySelector('.intro-loader');
  if (name) {
    setTimeout(() => {
      name.style.opacity = '1';
      name.style.transform = 'translateY(0)';
    }, 300);
  }
  if (intro) setTimeout(() => (intro.style.top = '-100%'), 2000);
});

// Config 
const API_KEY = ''; // paste Gemini API key here
const DEFAULT_MODEL = 'gemini-3.8-flash'; // or 'gemini-flash-latest' to always track the newest Flash
const MAX_HISTORY = 20;
const SYSTEM_PROMPT = 'You are Verge, a helpful assistant.';

let selectedModel = DEFAULT_MODEL;
let conversationHistory = [];
let isBusy = false;


// File button 
const realFileBtn = document.getElementById('real-file');
const customPublishBtn = document.getElementById('custom-publish-btn');
if (customPublishBtn && realFileBtn) {
  customPublishBtn.addEventListener('click', () => realFileBtn.click());
  realFileBtn.addEventListener('change', () => {
    const file = realFileBtn.files[0];
    if (file) console.log('Selected:', file.name); // TODO: handle upload
  });
}

// Chat
const promptForm = document.querySelector('.prompt-form');
const promptInput = document.querySelector('.prompt-input');
const chatHistory = document.getElementById('chat-history');
const welcomeBanner = document.getElementById('welcome-banner');
const appWrapper = document.getElementById('app-wrapper');
const chips = document.querySelectorAll('.chip');

function appendMessage(text, sender) {
  if (!chatHistory) return null;
  const classes = sender.split(' ');
  const div = document.createElement('div');
  div.classList.add('message', ...classes);
  div.id = 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2);

  const isReply = classes.includes('assistant') && !classes.includes('loading');
  if (isReply && window.marked && window.DOMPurify) {
    div.innerHTML = DOMPurify.sanitize(marked.parse(text, { breaks: true }));
  } else {
    div.textContent = text; // user messages and the loading text stay plain
  }

  chatHistory.appendChild(div);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  return div.id;
}
function removeMessage(id) {
  document.getElementById(id)?.remove();
}

// Pulls the reply text out of a Gemini response, or returns an error string.
function parseGeminiResponse(data) {
  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) return { error: `Your message was blocked (${blockReason}).` };

  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts || [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join('');

  if (text) return { text };
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
    return { error: `The response was stopped (${candidate.finishReason}).` };
  }
  return { error: 'The API returned an empty response.' };
}

const FALLBACK_MODELS = ['gemini-3.1-flash-lite']; // try if the main model stays overloaded

async function callGemini(payload) {
  const models = [selectedModel, ...FALLBACK_MODELS];
  let res;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
          body: payload
        }
      );
      if (res.status !== 503) return res; // success or a different error: stop retrying
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); // wait time
    }
  }
  return res;
}

if (promptForm && promptInput) {
  promptForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userText = promptInput.value.trim();
    if (!userText || isBusy) return;

    if (!API_KEY) {
      appendMessage('Add your Gemini API key to API_KEY at the top of script.js.', 'assistant');
      return;
    }

    isBusy = true;
    appWrapper?.classList.add('chat-active');
    if (welcomeBanner) welcomeBanner.style.display = 'none';

    appendMessage(userText, 'user');
    promptInput.value = '';
    conversationHistory.push({ role: 'user', parts: [{ text: userText }] });

    const loadingId = appendMessage('Verge is thinking...', 'assistant loading');

    try {
      const response = await callGemini(
  JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: conversationHistory.slice(-MAX_HISTORY)
  })
);

      const data = await response.json().catch(() => ({}));
      removeMessage(loadingId);

      if (!response.ok) {
        console.error('Gemini API error:', response.status, data);
        appendMessage(`Error ${response.status}: ${data?.error?.message || 'Request failed.'}`, 'assistant');
        conversationHistory.pop();
        return;
      }

      const result = parseGeminiResponse(data);
      if (result.error) {
        console.error('Gemini response problem:', data);
        appendMessage(result.error, 'assistant');
        conversationHistory.pop();
        return;
      }

      appendMessage(result.text, 'assistant');
      conversationHistory.push({ role: 'model', parts: [{ text: result.text }] });
    } catch (err) {
      console.error('Network error:', err);
      removeMessage(loadingId);
      appendMessage('Error connecting to the AI server. Check your connection.', 'assistant');
      conversationHistory.pop();
    } finally {
      isBusy = false;
    }
  });
}

chips.forEach((chip) => {
  chip.addEventListener('click', () => {
    if (!promptInput) return;
    promptInput.value = chip.textContent.trim();
    promptInput.focus();
  });
});