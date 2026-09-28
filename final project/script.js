const toggleBtn = document.getElementById('theme-toggle');
if (toggleBtn) {
    toggleBtn.addEventListener('click', function() {
        const currentIcon = this.textContent.trim();
        if (currentIcon === 'toggle_on') {
            this.textContent = 'toggle_off';
            document.body.classList.add('dark-mode');
        } else {
            this.textContent = 'toggle_on';
            document.body.classList.remove('dark-mode');
        }
    });
}

window.addEventListener("load", () => {
    let name = document.querySelector(".name");
    let intro = document.querySelector(".intro-loader");

    if (name) {
        setTimeout(() => {
            name.style.opacity = '1';
            name.style.transform = 'translateY(0)';
        }, 300);
    }
    if (intro) {
        setTimeout(() => {
            intro.style.top = '-100%';
        }, 2000);
    }
});

// Dropdown model selector logic
const modelBtn = document.getElementById('model-selector-btn');
const dropdownMenu = document.getElementById('model-dropdown');
const currentModelText = document.getElementById('current-model');
const dropdownItems = document.querySelectorAll('.dropdown-item');

if (modelBtn && dropdownMenu) {
    modelBtn.addEventListener('click', function(event) {
        dropdownMenu.classList.toggle('show');
        event.stopPropagation(); 
    });

    dropdownItems.forEach(item => {
        item.addEventListener('click', function() {
            if (currentModelText) currentModelText.textContent = this.textContent; 
            dropdownMenu.classList.remove('show');           
        });
    });

    document.addEventListener('click', function(event) {
        if (!modelBtn.contains(event.target)) {
            dropdownMenu.classList.remove('show');
        }
    });
}

const realFileBtn = document.getElementById("real-file");
const customPublishBtn = document.getElementById("custom-publish-btn");

if (customPublishBtn && realFileBtn) {
    customPublishBtn.addEventListener("click", () => realFileBtn.click());
}

// Chat Functionality & Layout Transition
const promptForm = document.querySelector('.prompt-form');
const promptInput = document.querySelector('.prompt-input');
const chatHistory = document.getElementById('chat-history');
const welcomeBanner = document.getElementById('welcome-banner');
const appWrapper = document.getElementById('app-wrapper');
const chips = document.querySelectorAll('.chip');

const API_KEY = 'AQ.Ab8RN6LVivREzkN9pQEG_dIcTiKkgDwXn_C0U5mnnPBEIHTpBA'; 
let conversationHistory = [];

if (promptForm && promptInput) {
    promptForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const userText = promptInput.value.trim();
        if (!userText) return;

        // Force browser to register state change and animate smoothly
        if (appWrapper) {
            appWrapper.classList.add('chat-active');
        }
        if (welcomeBanner) {
            welcomeBanner.style.display = 'none';
        }

        // 2. Display User Message
        appendMessage(userText, 'user');
        promptInput.value = '';

        conversationHistory.push({
            role: "user",
            parts: [{ text: userText }]
        });

        // 3. Temporary Loading Message
        const loadingId = appendMessage('Verge is thinking...', 'assistant loading');

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: conversationHistory })
            });

            const data = await response.json();
            const loadingElement = document.getElementById(loadingId);
            if (loadingElement) loadingElement.remove();

            if (data.candidates && data.candidates[0].content.parts[0].text) {
                const aiReply = data.candidates[0].content.parts[0].text;
                appendMessage(aiReply, 'assistant');

                conversationHistory.push({
                    role: "model",
                    parts: [{ text: aiReply }]
                });
            } else {
                appendMessage('Sorry, I received an unexpected response structure from the API.', 'assistant');
            }

        } catch (error) {
            console.error('API Error:', error);
            const loadingElement = document.getElementById(loadingId);
            if (loadingElement) loadingElement.remove();
            appendMessage('Error connecting to the AI server. Please check your API key.', 'assistant');
        }
    });
}

chips.forEach(chip => {
    chip.addEventListener('click', function() {
        if (promptInput) {
            promptInput.value = this.textContent;
            promptInput.focus();
        }
    });
});

function appendMessage(text, sender) {
    if (!chatHistory) return null;

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', ...sender.split(' '));
    
    const messageId = 'msg-' + Date.now() + Math.random();
    messageDiv.id = messageId;
    
    messageDiv.textContent = text;
    chatHistory.appendChild(messageDiv);
    
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return messageId;
}