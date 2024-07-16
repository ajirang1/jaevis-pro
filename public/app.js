document.addEventListener('DOMContentLoaded', async () => {
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatOutput = document.getElementById('chat-output');

    const threadId = await fetch('/thread', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    }).then(res => res.json()).then(data => data.threadId);

    const headerElement = document.getElementById('header'); // Assuming your header has an ID of 'header'
    const threaDiv = document.createElement('div');
    const threadIdSpan = document.createElement('h5');
    threadIdSpan.textContent = `${threadId}`;
    threadIdSpan.style.color = 'white';
    threadIdSpan.style.fontSize = '0.4em'; // Making the font a little smaller

    threaDiv.appendChild(threadIdSpan); // Append the span to the threaDiv
    headerElement.appendChild(threaDiv); // Append the threaDiv to the header

    chatForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const userMessage = chatInput.value;
        chatInput.value = '';
        addMessage('나', userMessage, 'user-message');
        const loadingMessage = addMessage('Jaevis', 'Jaevis가 입력중입니다...', 'assistant-message loading');

        try {
            const response = await fetch('/message', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({message: userMessage, threadId})
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const data = await response.json();
            const assistantMessage = data.message[0]?.text?.value; // Extract assistant message text value
            const audioFile = '/speech.mp3'
            console.log(assistantMessage + ` 대답임`);
            updateLoadingMessage(loadingMessage, assistantMessage);
            const speech = document.getElementById('speech');
            const source = speech.querySelector('source');
            source.src = `/speech.mp3?${new Date().getTime()}`;
            speech.load();
            speech.onloadeddata = function () {
                speech.play();
                console.log('played');
            }


        } catch (error) {
            console.error('Error fetching or parsing data:', error);
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