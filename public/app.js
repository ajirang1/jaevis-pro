document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatOutput = document.getElementById('chat-output');

    let conversationHistory = [];

    chatForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const userMessage = chatInput.value;
        addMessage('Me', userMessage, 'user-message');
        chatInput.value = '';

        conversationHistory.push({ role: 'user', content: userMessage });

        const loadingMessage = addMessage('ChatGPT', 'ChatGPT is typing...', 'assistant-message loading');

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ messages: conversationHistory })
            });

            const data = await response.json();
            const assistantMessage = data.message;

            const messageBubble = loadingMessage.querySelector('.message-bubble');
            messageBubble.classList.remove('loading');
            messageBubble.style.background = 'white';
            messageBubble.style.color = 'black';
            messageBubble.innerText = assistantMessage;

            // Cache-busting mechanism for audio file
            const speech = document.getElementById('speech');
            const source = speech.querySelector('source');
            source.src = `/speech.mp3?${new Date().getTime()}`;
            speech.load();
            speech.onloadeddata = function() {
                speech.play();
                console.log('played');
            };

            conversationHistory.push({ role: 'assistant', content: assistantMessage });

        } catch (error) {
            chatOutput.removeChild(loadingMessage);
            console.error('Error:', error);
        }
    });

    function addMessage(sender, message, className) {
        const messageContainer = document.createElement('div');
        messageContainer.className = `message-container ${className}`;

        const messageSender = document.createElement('div');
        messageSender.className = 'message-sender';
        messageSender.innerText = sender;

        const messageBubble = document.createElement('div');
        messageBubble.className = 'message-bubble';
        messageBubble.innerText = message;

        messageContainer.appendChild(messageSender);
        messageContainer.appendChild(messageBubble);
        chatOutput.appendChild(messageContainer);

        chatOutput.scrollTop = chatOutput.scrollHeight; // Scroll to the bottom

        return messageContainer;
    }
});