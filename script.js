// Config & state 
const DEFAULT_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODELS = ['gemini-3.8-flash-lite'];
const MAX_HISTORY = 20;
const SYSTEM_PROMPT = 'You are Verge, a helpful assistant.';

let selectedModel = DEFAULT_MODEL;
let conversationHistory = [];
let isBusy = false;

// DOM references 
const $ = (id) => document.getElementById(id);

const appWrapper = $('app-wrapper');
const chatHistory = $('chat-history');
const promptForm = document.querySelector('.prompt-form');
const promptInput = document.querySelector('.prompt-input');
const chips = document.querySelectorAll('.chip');

const sidebarToggleBtn = $('sidebar-toggle');
const studySidebar = $('study-sidebar');
const themeToggleBtn = $('theme-toggle');
const btnNewChat = $('btn-newchat');
const btnQuiz = $('btn-quiz');
const btnFlashcards = $('btn-flashcards');

const realFileBtn = $('real-file');
const customPublishBtn = $('custom-publish-btn');
const attachment = $('attachment');
const attachmentImg = $('attachment-img');

const cameraBtn = $('camera-btn');
const cameraModal = $('camera-modal');
const cameraVideo = $('camera-video');
const cameraCanvas = $('camera-canvas');
const micBtn = $('mic-btn');

//  Theme 
themeToggleBtn?.addEventListener('click', () => {
  const dark = document.body.classList.toggle('dark-mode');
  themeToggleBtn.textContent = dark ? 'toggle_on' : 'toggle_off';
});

// Sidebar & New Chat 
function setSidebarCollapsed(collapsed) {
  studySidebar.classList.toggle('collapsed', collapsed);
  sidebarToggleBtn.textContent = collapsed ? 'menu' : 'menu_open';
}

if (window.innerWidth < 768) setSidebarCollapsed(true);
sidebarToggleBtn?.addEventListener('click', () => {
  setSidebarCollapsed(!studySidebar.classList.contains('collapsed'));
});

function newChat() {
  if (isBusy) return;
  conversationHistory = [];
  chatHistory.replaceChildren();
  clearAttachment();
  promptInput.value = '';
  closeStudy();
  appWrapper.classList.remove('chat-active');
  if (window.innerWidth < 768) setSidebarCollapsed(true);
}

btnNewChat?.addEventListener('click', newChat);

//  Image attach (file + camera) 
let pendingImage = null; // { mimeType, data, dataUrl }

function setPendingImage(dataUrl) {
  pendingImage = { mimeType: 'image/jpeg', data: dataUrl.split(',')[1], dataUrl };
  attachmentImg.src = dataUrl;
  attachment.hidden = false;
  promptInput.focus();
}

function clearAttachment() {
  pendingImage = null;
  attachment.hidden = true;
  attachmentImg.removeAttribute('src');
}

// Downscales any drawable (image / video) and returns a JPEG data URL
function drawableToDataUrl(source, width, height, max = 1024) {
  const scale = Math.min(1, max / Math.max(width, height));
  cameraCanvas.width = Math.round(width * scale);
  cameraCanvas.height = Math.round(height * scale);
  cameraCanvas.getContext('2d').drawImage(source, 0, 0, cameraCanvas.width, cameraCanvas.height);
  return cameraCanvas.toDataURL('image/jpeg', 0.85);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not read ${file.name}.`)); };
    img.src = url;
  });
}

customPublishBtn?.addEventListener('click', () => realFileBtn.click());
realFileBtn?.addEventListener('change', async () => {
  const file = realFileBtn.files[0];
  realFileBtn.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('Only image files are supported here. To build a quiz or flashcards from a PDF or text file, open Generate Quiz / Flashcards and attach it there.');
    return;
  }
  try {
    const img = await loadImage(file);
    setPendingImage(drawableToDataUrl(img, img.naturalWidth, img.naturalHeight));
  } catch (err) {
    alert(err.message);
  }
});

let cameraStream = null;
let facingMode = 'user';

async function startCamera() {
  stopCamera();
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('Camera access needs HTTPS or localhost.');
    return false;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
    cameraVideo.srcObject = cameraStream;
    return true;
  } catch (err) {
    console.error('Camera error:', err);
    alert(err.name === 'NotAllowedError'
      ? 'Camera permission was denied. Allow it in your browser settings and try again.'
      : 'Could not open the camera.');
    return false;
  }
}

function stopCamera() {
  cameraStream?.getTracks().forEach((t) => t.stop());
  cameraStream = null;
  cameraVideo.srcObject = null;
}

async function openCamera() {
  cameraModal.hidden = false;
  if (!(await startCamera())) cameraModal.hidden = true;
}

function closeCamera() {
  stopCamera();
  cameraModal.hidden = true;
}

function capturePhoto() {
  if (!cameraVideo.videoWidth) return;
  setPendingImage(drawableToDataUrl(cameraVideo, cameraVideo.videoWidth, cameraVideo.videoHeight));
  closeCamera();
}

cameraBtn?.addEventListener('click', openCamera);
$('camera-close')?.addEventListener('click', closeCamera);
$('camera-capture')?.addEventListener('click', capturePhoto);
$('attachment-remove')?.addEventListener('click', clearAttachment);
$('camera-flip')?.addEventListener('click', () => {
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  startCamera();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !cameraModal.hidden) closeCamera();
});

// Speech to text 
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;
let baseText = '';

if (!SpeechRecognition) {
  micBtn.disabled = true;
  micBtn.title = 'Speech recognition is not supported in this browser';
  micBtn.style.opacity = '0.35';
} else {
  recognition = new SpeechRecognition();
  recognition.lang = navigator.language || 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = () => {
    listening = true;
    micBtn.classList.add('listening');
    baseText = promptInput.value ? promptInput.value.trimEnd() + ' ' : '';
  };

  recognition.onresult = (e) => {
    let transcript = '';
    for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
    promptInput.value = baseText + transcript;
  };

  recognition.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      alert('Microphone permission was denied. Allow it in your browser settings and try again.');
    } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
      console.error('Speech error:', e.error);
    }
  };

  recognition.onend = () => {
    listening = false;
    micBtn.classList.remove('listening');
    promptInput.focus();
  };

  micBtn.addEventListener('click', () => (listening ? recognition.stop() : recognition.start()));
}

//  Chat rendering    
function appendMessage(text, sender, imageUrl) {
  if (!chatHistory) return null;
  const classes = sender.split(' ');
  const div = document.createElement('div');
  div.classList.add('message', ...classes);
  div.id = 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2);

  const isLoading = classes.includes('loading');
  const isReply = classes.includes('assistant') && !isLoading;

  if (isLoading) {
    div.setAttribute('role', 'status');
    div.setAttribute('aria-label', text);
    div.innerHTML = '<div class="loader"></div>';
  } else if (isReply && window.marked && window.DOMPurify) {
    div.innerHTML = DOMPurify.sanitize(marked.parse(text, { breaks: true }));
  } else {
    div.textContent = text;
  }

  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'Attached photo';
    img.className = 'attached';
    div.prepend(img);
  }

  chatHistory.appendChild(div);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  return div.id;
}

function removeMessage(id) {
  document.getElementById(id)?.remove();
}

//  Gemini API helpers 
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

// Retries 503s with backoff, then falls back to the next model. (Ai generated)
async function callGemini(payload) {
  const models = [selectedModel, ...FALLBACK_MODELS];
  let res;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          payload: JSON.parse(payload)
        })
      });
      if (res.status !== 503) return res;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  return res;
}

// Asks Gemini for JSON matching `schema`. `extraParts` carries attached files.
async function generateStructured(prompt, schema, extraParts = []) {
  const response = await callGemini(
    JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [...extraParts, { text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature: 0.7
      }
    })
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Request failed (${response.status}).`);

  const result = parseGeminiResponse(data);
  if (result.error) throw new Error(result.error);

  const clean = result.text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error('Gemini returned an invalid format. Please try again.');
  }
}

function getContents() {
  const recent = conversationHistory.slice(-MAX_HISTORY);
  while (recent.length && recent[0].role !== 'user') recent.shift();
  return recent;
}

// Chat submit (+ study intent)

// Detects messages like "generate flashcards about biology" or "create a 10 question quiz on WW2"
function detectStudyIntent(text) {
  const m = text.match(
    /^\s*(?:(?:please|pls|kindly|can you|could you|would you|i want you to|i want|i need|let'?s)\s+)*(?:generate|create|make|build|prepare|give me|write)\b[^.?!\n]{0,40}?\b(flash\s?cards?|quiz(?:zes)?)\b/i
  );
  if (!m) return null;

  const mode = /^flash/i.test(m[1]) ? 'flashcards' : 'quiz';
  const rest = text.slice(m[0].length);

    // Topic: "... about X", "... on X", "... for X", or ": X"
  const topicMatch =
    rest.match(/\b(?:about|on|regarding|covering|for|of|from)\s+(.+)/i) ||
    rest.match(/^\s*[:\-]\s*(.+)/);

  let topic = topicMatch ? topicMatch[1] : '';
  topic = topic
    .replace(/\b(easy|medium|hard)\b(\s+(level|difficulty))?/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.:;-]+|[\s,.!?;:-]+$/g, '');

  // Count: nearest of 5 / 10 / 15, looked up before the topic so "2024" in a topic doesn't count
  const head = topicMatch ? text.slice(0, m[0].length + topicMatch.index) : text;
  const num = head.match(/\b(\d{1,2})\b/);
  const count = num
    ? String([5, 10, 15].reduce((a, b) => (Math.abs(b - num[1]) < Math.abs(a - num[1]) ? b : a)))
    : null;

  const diff = text.match(/\b(easy|medium|hard)\b/i);

  return { mode, topic, count, difficulty: diff ? diff[1].toLowerCase() : null };
}

promptForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const userText = promptInput.value.trim();
  if (!userText || isBusy) return;

  // "Generate flashcards / quiz ..." goes straight to the study page
   const intent = detectStudyIntent(userText);
  if (intent) {
    if (listening) recognition.stop();
    promptInput.value = '';
    openStudy(intent.mode, { ...intent, autoStart: true, fromChat: true });
    return;
  }

  isBusy = true;
  if (listening) recognition.stop();

  appWrapper.classList.add('chat-active');

  const parts = [{ text: userText }];
  if (pendingImage) parts.unshift({ inlineData: { mimeType: pendingImage.mimeType, data: pendingImage.data } });

  appendMessage(userText, 'user', pendingImage?.dataUrl);
  conversationHistory.push({ role: 'user', parts });
  promptInput.value = '';
  clearAttachment();

  const loadingId = appendMessage('Verge is thinking...', 'assistant loading');

  try {
    const response = await callGemini(
      JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: getContents()
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

// Suggestion chips send immediately
chips.forEach((chip) => {
  chip.addEventListener('click', () => {
    if (isBusy) return;
    promptInput.value = chip.textContent.trim();
    promptForm.requestSubmit();
  });
});

// 10. Study mode (quiz + flashcards)
const studyTitle = $('study-title');
const studySetup = $('study-setup');
const studyTopic = $('study-topic');
const studyCount = $('study-count');
const studyDifficulty = $('study-difficulty');
const studyContextRow = $('study-context-row');
const studyUseChat = $('study-use-chat');
const studyLoading = $('study-loading');
const studyError = $('study-error');
const studyOutput = $('study-output');
const studyFileInput = $('study-file');
const studyAttachBtn = $('study-attach');
const studyFileList = $('study-file-list');

let studyMode = null;    // 'quiz' | 'flashcards'
let studyData = null;    // parsed Gemini JSON
let studyFiles = [];     // attached source files
let flashActions = null; // keyboard hooks for the flashcard view

const MAX_STUDY_FILES = 5;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_CHARS = 60000;
const TEXT_EXTS = ['txt', 'md', 'csv', 'json', 'html', 'htm', 'xml', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'css', 'log'];

const QUIZ_SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          answerIndex: { type: 'INTEGER' },
          explanation: { type: 'STRING' }
        },
        required: ['question', 'options', 'answerIndex', 'explanation']
      }
    }
  },
  required: ['questions']
};

const FLASHCARD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    cards: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          front: { type: 'STRING' },
          back: { type: 'STRING' }
        },
        required: ['front', 'back']
      }
    }
  },
  required: ['cards']
};

// Small DOM helper (uses textContent, so API text is never treated as HTML)
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showStudyState(state) { // 'setup' | 'loading' | 'output'
  studySetup.hidden = state !== 'setup';
  studyLoading.hidden = state !== 'loading';
  studyOutput.hidden = state !== 'output';
  if (state !== 'output') flashActions = null;
  if (state !== 'setup') studyError.hidden = true;
}

function showStudyError(message) {
  studyError.textContent = message;
  studyError.hidden = false;
}

// Attached files 
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function readStudyFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is too large (max 15 MB).`);

  if (file.type.startsWith('image/')) {
    const img = await loadImage(file);
    const dataUrl = drawableToDataUrl(img, img.naturalWidth, img.naturalHeight, 1600);
    return { name: file.name, kind: 'image', mimeType: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl };
  }

  if (file.type === 'application/pdf' || ext === 'pdf') {
    const dataUrl = await readAsDataUrl(file);
    return { name: file.name, kind: 'pdf', mimeType: 'application/pdf', data: dataUrl.split(',')[1] };
  }

  if (file.type.startsWith('text/') || TEXT_EXTS.includes(ext)) {
    const text = (await file.text()).slice(0, MAX_TEXT_CHARS);
    if (!text.trim()) throw new Error(`${file.name} is empty.`);
    return { name: file.name, kind: 'text', text };
  }

  throw new Error(`${file.name}: unsupported file type. Use a PDF, image or text file (convert Word/PowerPoint to PDF first).`);
}

async function addStudyFiles(files) {
  studyError.hidden = true;
  for (const file of files) {
    if (studyFiles.length >= MAX_STUDY_FILES) {
      showStudyError(`You can attach up to ${MAX_STUDY_FILES} files.`);
      break;
    }
    try {
      studyFiles.push(await readStudyFile(file));
    } catch (err) {
      showStudyError(err.message);
    }
  }
  renderStudyFiles();
}

function renderStudyFiles() {
  studyFileList.replaceChildren();
  studyFileList.hidden = studyFiles.length === 0;

  studyFiles.forEach((f, i) => {
    const chip = el('div', 'file-chip');

    if (f.preview) {
      const thumb = el('img', 'file-thumb');
      thumb.src = f.preview;
      thumb.alt = '';
      chip.append(thumb);
    } else {
      chip.append(el('span', 'file-icon', f.kind === 'pdf' ? '📄' : '📃'));
    }

    chip.append(el('span', 'file-name', f.name));

    const remove = el('button', 'file-remove material-symbols-rounded', 'close');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${f.name}`);
    remove.addEventListener('click', () => {
      studyFiles.splice(i, 1);
      renderStudyFiles();
    });
    chip.append(remove);

    studyFileList.append(chip);
  });
}

function filesToParts() {
  return studyFiles.map((f) =>
    f.kind === 'text'
      ? { text: `--- File: ${f.name} ---\n${f.text}` }
      : { inlineData: { mimeType: f.mimeType, data: f.data } }
  );
}

studyAttachBtn?.addEventListener('click', () => studyFileInput.click());
studyFileInput?.addEventListener('change', () => {
  const files = [...studyFileInput.files];
  studyFileInput.value = '';
  if (files.length) addStudyFiles(files);
});

// Open / close the study page 
function openStudy(mode, preset = {}) {
  if (isBusy) return;
  studyMode = mode;
  studyData = null;
  studyTitle.textContent = mode === 'quiz' ? 'Generate Quiz' : 'Generate Flashcards';

  studyTopic.value = preset.topic || '';
  studyCount.value = preset.count || '5';
  studyDifficulty.value = preset.difficulty || 'medium';

  // Start with a clean file list; a photo attached in the chat bar moves over
  studyFiles = [];
  if (preset.fromChat && pendingImage) {
    studyFiles.push({
      name: 'photo.jpg',
      kind: 'image',
      mimeType: pendingImage.mimeType,
      data: pendingImage.data,
      preview: pendingImage.dataUrl
    });
    clearAttachment();
  }
  renderStudyFiles();

  const hasChat = conversationHistory.length > 0;
  studyContextRow.hidden = !hasChat;
  // A topic or file given by the user wins over the old conversation
  studyUseChat.checked = hasChat && !preset.topic && studyFiles.length === 0;

  studyOutput.replaceChildren();
  studyError.hidden = true;
  showStudyState('setup');

  appWrapper.classList.add('study-active');
  btnQuiz.classList.toggle('active', mode === 'quiz');
  btnFlashcards.classList.toggle('active', mode === 'flashcards');
  if (window.innerWidth < 768) setSidebarCollapsed(true);

  const canStart = preset.topic || studyFiles.length > 0 || studyUseChat.checked;
  if (preset.autoStart && canStart) runStudyGeneration();
  else studyTopic.focus();
}

function closeStudy() {
  studyMode = null;
  studyData = null;
  studyFiles = [];
  flashActions = null;
  appWrapper.classList.remove('study-active');
  btnQuiz.classList.remove('active');
  btnFlashcards.classList.remove('active');
}

// Prompt building 
function chatTranscript() {
  return conversationHistory
    .slice(-MAX_HISTORY)
    .map((turn) => {
      const text = turn.parts.filter((p) => p.text).map((p) => p.text).join(' ');
      return `${turn.role === 'user' ? 'User' : 'Assistant'}: ${text}`;
    })
    .join('\n\n')
    .slice(0, 12000);
}

function buildStudyPrompt(topic, useChat, hasFiles) {
  const n = studyCount.value;
  const level = studyDifficulty.value;

  let source;
  if (!useChat && !hasFiles) {
    source = `the topic: ${topic}`;
  } else {
    const bits = [];
    if (hasFiles) bits.push('the attached file(s)');
    if (useChat) bits.push('the conversation provided below');
    source = bits.join(' and ');
    if (topic) source += ` (focus on: ${topic})`;
  }
  const chatBlock = useChat ? `\n\nConversation:\n${chatTranscript()}` : '';
  const grounding = hasFiles ? ' Only use facts that appear in the provided material.' : '';

  if (studyMode === 'quiz') {
    return `Create a ${n}-question multiple-choice quiz at ${level} difficulty based on ${source}.${grounding}\n\n` +
      'Rules: each question has exactly 4 options, exactly one is correct, "answerIndex" is the 0-based index of the correct option, ' +
      'and "explanation" is one or two sentences explaining why it is correct. Do not put letters like "A)" in the options. ' +
      `Vary which position holds the correct answer.${chatBlock}`;
  }
  return `Create ${n} study flashcards at ${level} difficulty based on ${source}.${grounding}\n\n` +
    'Rules: "front" must be a complete question written as a full sentence ending with a question mark ' +
    '(never a bare term, and never the answer). "back" is the clear, concise answer to that exact question (max 2 sentences).' +
    chatBlock;
}

function validateStudyData(data) {
  if (studyMode === 'quiz') {
    const qs = (data?.questions || []).filter(
      (q) =>
        q?.question &&
        Array.isArray(q.options) &&
        q.options.length >= 2 &&
        Number.isInteger(q.answerIndex) &&
        q.answerIndex >= 0 &&
        q.answerIndex < q.options.length
    );
    if (!qs.length) throw new Error('No valid questions came back. Please try again.');
    return { questions: qs };
  }
  const cards = (data?.cards || []).filter((c) => c?.front && c?.back);
  if (!cards.length) throw new Error('No flashcards came back. Please try again.');
  return { cards };
}

/* --- Generate --- */
async function runStudyGeneration() {
  if (isBusy) return;

  const topic = studyTopic.value.trim();
  const useChat = !studyContextRow.hidden && studyUseChat.checked;
  const hasFiles = studyFiles.length > 0;

  if (!useChat && !topic && !hasFiles) return showStudyError('Enter a topic or attach a file first.');
  
  isBusy = true;
  showStudyState('loading');

  try {
    const raw = await generateStructured(
      buildStudyPrompt(topic, useChat, hasFiles),
      studyMode === 'quiz' ? QUIZ_SCHEMA : FLASHCARD_SCHEMA,
      filesToParts()
    );
    studyData = validateStudyData(raw);
    showStudyState('output');
    if (studyMode === 'quiz') renderQuiz();
    else renderFlashcards();
  } catch (err) {
    console.error('Study generation error:', err);
    showStudyState('setup');
    showStudyError(err.message || 'Something went wrong. Please try again.');
  } finally {
    isBusy = false;
  }
}

studySetup?.addEventListener('submit', (e) => {
  e.preventDefault();
  runStudyGeneration();
});

$('study-back')?.addEventListener('click', closeStudy);
btnQuiz?.addEventListener('click', () => openStudy('quiz'));
btnFlashcards?.addEventListener('click', () => openStudy('flashcards'));

function backToSetup() {
  studyOutput.replaceChildren();
  showStudyState('setup');
  studyTopic.focus();
}
// Quiz view 
function renderQuiz() {
  const questions = studyData.questions;
  let index = 0;
  let score = 0;

  function showQuestion() {
    const q = questions[index];
    studyOutput.replaceChildren();

    const meta = el('div', 'study-meta', `Question ${index + 1} of ${questions.length}`);
    const bar = el('div', 'progress');
    const fill = el('div', 'progress-bar');
    fill.style.width = `${(index / questions.length) * 100}%`;
    bar.append(fill);

    const text = el('h3', 'quiz-question', q.question);
    const list = el('div', 'quiz-options');
    const feedback = el('div', 'quiz-feedback');
    feedback.hidden = true;

    const next = el('button', 'primary-btn', index === questions.length - 1 ? 'See results' : 'Next');
    next.type = 'button';
    next.hidden = true;

    q.options.forEach((option, i) => {
      const btn = el('button', 'quiz-option');
      btn.type = 'button';
      btn.append(el('span', 'quiz-letter', String.fromCharCode(65 + i)), el('span', '', option));

      btn.addEventListener('click', () => {
        const correct = i === q.answerIndex;
        if (correct) score++;

        [...list.children].forEach((child, ci) => {
          child.disabled = true;
          if (ci === q.answerIndex) child.classList.add('correct');
          else if (ci === i) child.classList.add('wrong');
          else child.classList.add('dim');
        });

        feedback.textContent = (correct ? 'Correct! ' : 'Not quite. ') + (q.explanation || '');
        feedback.classList.add(correct ? 'good' : 'bad');
        feedback.hidden = false;
        next.hidden = false;
        next.focus();
      });

      list.append(btn);
    });

    next.addEventListener('click', () => {
      index++;
      if (index < questions.length) showQuestion();
      else showResults();
    });

    studyOutput.append(meta, bar, text, list, feedback, next);
  }

  function showResults() {
    const percent = Math.round((score / questions.length) * 100);
    const message =
      percent === 100 ? 'Perfect score! 🎉' :
      percent >= 70 ? 'Great job!' :
      percent >= 40 ? 'Good effort, keep practicing.' :
      'Keep studying, you will get there.';

    const retry = el('button', 'primary-btn', 'Retry quiz');
    retry.type = 'button';
    retry.addEventListener('click', renderQuiz);

    const fresh = el('button', 'secondary-btn', 'New quiz');
    fresh.type = 'button';
    fresh.addEventListener('click', backToSetup);

    const row = el('div', 'btn-row');
    row.append(retry, fresh);

    studyOutput.replaceChildren(
      el('div', 'quiz-score', `${score} / ${questions.length}`),
      el('p', 'quiz-score-sub', `${percent}% · ${message}`),
      row
    );
  }

  showQuestion();
}

// Flashcards view (always shows the question first) 
function renderFlashcards() {
  const cards = [...studyData.cards];
  let index = 0;
  let flipped = false; // false = question side, true = answer side

  studyOutput.replaceChildren();

  const meta = el('div', 'study-meta');
  const bar = el('div', 'progress');
  const fill = el('div', 'progress-bar');
  bar.append(fill);

  const card = el('button', 'flashcard');
  card.type = 'button';
  card.setAttribute('aria-label', 'Flip card');
  const inner = el('div', 'flashcard-inner');
  const front = el('div', 'flashcard-face front');
  const back = el('div', 'flashcard-face back');
  inner.append(front, back);
  card.append(inner);

  const hint = el('p', 'flash-hint');

  const prev = el('button', 'secondary-btn', '← Prev');
  const flip = el('button', 'primary-btn');
  const next = el('button', 'secondary-btn', 'Next →');
  const shuffle = el('button', 'secondary-btn', '🔀 Shuffle');
  [prev, flip, next, shuffle].forEach((b) => (b.type = 'button'));

  const row = el('div', 'btn-row');
  row.append(prev, flip, next, shuffle);

  function update() {
    front.replaceChildren(el('span', 'face-label', 'Question'), el('p', '', cards[index].front));
    back.replaceChildren(el('span', 'face-label', 'Answer'), el('p', '', cards[index].back));
    card.classList.toggle('flipped', flipped);
    flip.textContent = flipped ? 'Show question' : 'Show answer';
    hint.textContent = flipped
      ? 'Click the card to see the question again · ← → to move'
      : 'Click the card to reveal the answer · ← → to move';
    meta.textContent = `Card ${index + 1} of ${cards.length}`;
    fill.style.width = `${((index + 1) / cards.length) * 100}%`;
    prev.disabled = index === 0;
    next.disabled = index === cards.length - 1;
  }

  const doFlip = () => { flipped = !flipped; update(); };
  const go = (step) => {
    const target = index + step;
    if (target < 0 || target >= cards.length) return;
    index = target;
    flipped = false; // every card starts on its question
    update();
  };

  card.addEventListener('click', doFlip);
  flip.addEventListener('click', doFlip);
  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));
  shuffle.addEventListener('click', () => {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    index = 0;
    flipped = false;
    update();
  });

  flashActions = { flip: doFlip, prev: () => go(-1), next: () => go(1) };

  const newSet = el('button', 'secondary-btn block-btn', 'New flashcards');
  newSet.type = 'button';
  newSet.addEventListener('click', backToSetup);

  studyOutput.append(meta, bar, card, hint, row, newSet);
  update();
}

// Keyboard controls for flashcards
document.addEventListener('keydown', (e) => {
  if (!flashActions || !appWrapper.classList.contains('study-active')) return;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

  if (e.key === 'ArrowLeft') flashActions.prev();
  else if (e.key === 'ArrowRight') flashActions.next();
  else if (e.key === ' ' && e.target === document.body) {
    e.preventDefault();
    flashActions.flip();
  }
});
