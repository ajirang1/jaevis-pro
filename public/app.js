document.addEventListener('DOMContentLoaded', async () => {
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatOutput = document.getElementById('chat-output');
    const fileInput = document.getElementById('file-input');
    const fileUploadButton = document.getElementById('file-upload-button');
    const micButton = document.getElementById('mic-button');

    const threadId = await fetch('/thread', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    }).then(res => res.json()).then(data => data.threadId);

    const headerElement = document.getElementById('header');
    const threaDiv = document.createElement('div');
    const threadIdSpan = document.createElement('h5');
    threadIdSpan.textContent = `${threadId}`;
    threadIdSpan.style.color = 'white';
    threadIdSpan.style.fontSize = '0.4em';

    threaDiv.appendChild(threadIdSpan);
    headerElement.appendChild(threaDiv);

    chatForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // Prevent form submission

        if (chatInput.value.trim() === '') {
            // Apply the animation class
            chatInput.classList.add('border-red-animation');

            // Remove the class after the animation completes (2 seconds)
            setTimeout(function() {
                chatInput.classList.remove('border-red-animation');
            }, 2000);

            return; // Exit the function to prevent further execution
        }

        const userMessage = chatInput.value;
        chatInput.value = '';
        addMessage('나', userMessage, 'user-message');
        const loadingMessage = addMessage('Jaevis', 'Jaevis가 입력중입니다...', 'assistant-message loading');

        try {
            const response = await fetch('/message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMessage, threadId })
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const data = await response.json();
            const assistantMessage = data.message[0]?.text?.value;
            const audioFile = '/speech.mp3';
            updateLoadingMessage(loadingMessage, assistantMessage);

            const speech = document.getElementById('speech');
            const source = speech.querySelector('source');
            source.src = `/speech.mp3?${new Date().getTime()}`;
            speech.load();
            speech.onloadeddata = function () {
                speech.play();
            }

        } catch (error) {
            console.error('Error fetching or parsing data:', error);
        }
    });

    fileUploadButton.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (file && file.size > 10 * 1024 * 1024) { // 10MB in bytes
            alert('파일 사이즈는 10MB를 넘지 않아야 합니다.');
            fileInput.value = ''; // Clear the input
        }
    });

    function addMessage(sender, message, className) {
        const messageContainer = document.createElement('div');
        messageContainer.className = `message-container ${className}`;
        messageContainer.innerHTML = `<div class="message-sender">${sender}</div><div class="message-bubble">${message}</div>`;
        chatOutput.appendChild(messageContainer);
        chatOutput.scrollTop = chatOutput.scrollHeight;
        return messageContainer;
    }

    function updateLoadingMessage(loadingMessage, assistantMessage) {
        const messageBubble = loadingMessage.querySelector('.message-bubble');
        messageBubble.classList.remove('loading');
        messageBubble.style.background = 'white';
        messageBubble.style.color = 'black';
        messageBubble.innerText = assistantMessage || 'Error: No response from assistant';
    }
});
