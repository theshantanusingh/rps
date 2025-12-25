const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');
const uploadTrigger = document.getElementById('upload-trigger');
const filePreview = document.getElementById('file-preview');
const fileName = document.getElementById('file-name');
const chatMessages = document.getElementById('chat-messages');
const loadingIndicator = document.getElementById('loading-indicator');
const sendBtn = document.getElementById('send-btn');

// Configure MarkdownIt with Highlight.js and KaTeX support
const md = window.markdownit({
    html: true,
    linkify: true,
    typographer: true,
    highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return '<pre class="hljs"><code>' +
                    hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                    '</code></pre>';
            } catch (__) { }
        }
        return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
    }
});

let history = [];

// Auto-resize textarea
messageInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    if (this.value.trim() === '') this.style.height = 'auto'; // reset
});

// File Upload Handling
uploadTrigger.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        fileName.textContent = fileInput.files[0].name;
        filePreview.classList.add('active');
    }
});

function clearFile() {
    fileInput.value = '';
    filePreview.classList.remove('active');
}
window.clearFile = clearFile;

// Chat Handling
chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const message = messageInput.value.trim();
    const file = fileInput.files[0];

    if (!message && !file) return;

    // Add User Message to UI
    appendMessage(message || (file ? `Attached file: ${file.name}` : ''), 'user');

    // Reset Input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    const currentFile = file; // Store reference
    clearFile();

    // Show Loading
    loadingIndicator.classList.add('active');
    sendBtn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('message', message);
        if (currentFile) {
            formData.append('report', currentFile);
        }
        formData.append('history', JSON.stringify(history));

        const res = await fetch('/api/chat', {
            method: 'POST',
            body: formData
        });

        const data = await res.json();

        if (data.success) {
            appendMessage(data.response, 'bot');

            // Update History
            history.push({
                role: 'user',
                parts: [{ text: message || (currentFile ? "Attached a medical report." : "") }]
            });
            history.push({
                role: 'model',
                parts: [{ text: data.response }]
            });
        } else {
            appendMessage("I apologize, but I encountered an error. Please try again.", 'bot');
        }

    } catch (error) {
        console.error(error);
        appendMessage("Network error. Please check your connection.", 'bot');
    } finally {
        loadingIndicator.classList.remove('active');
        sendBtn.disabled = false;
        scrollToBottom();
    }
});

function appendMessage(content, type) {
    const div = document.createElement('div');
    div.className = `message ${type}`;

    // Add Avatar
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = type === 'user' ?
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>' :
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"></path></svg>';

    // Wrapper for Role + Content
    const wrapper = document.createElement('div');
    wrapper.className = 'message-inner';

    const roleLabel = document.createElement('div');
    roleLabel.className = 'message-role';
    roleLabel.textContent = type === 'user' ? 'You' : 'Cozil';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if (type === 'bot') {
        const rendered = md.render(content);
        contentDiv.innerHTML = rendered;
        // Render Math manually since we are injecting HTML
        if (window.renderMathInElement) {
            renderMathInElement(contentDiv, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false }
                ],
                throwOnError: false
            });
        }
    } else {
        contentDiv.textContent = content;
    }

    wrapper.appendChild(roleLabel);
    wrapper.appendChild(contentDiv);

    div.appendChild(avatar);
    div.appendChild(wrapper);

    chatMessages.appendChild(div);
    scrollToBottom();
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
