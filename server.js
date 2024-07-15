const path = require('path');
const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('node:fs/promises');
const fetch = require('node-fetch');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const SPEECHIFY_API_KEY = "gYY2u8JgpciACjCGiazY2TjAwTBKi8yoKvK8-pciQQs=";
const API_BASE_URL = "https://api.sws.speechify.com";
const API_KEY = SPEECHIFY_API_KEY;
const VOICE_ID = "713c0e16-b98f-415a-9f40-f19901851051";

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.post('/api/chat', async (req, res) => {
    const messages = req.body.messages;

    try {
        // Send the chat message to OpenAI API
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo-0125',
            messages: messages
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const assistantMessage = response.data.choices[0].message.content;

        // Generate the speech audio file using Speechify
        const audio = await getAudio(assistantMessage);
        await fs.writeFile("./public/speech.mp3", audio);

        // Respond with the assistant's message
        res.json({ message: assistantMessage });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Error communicating with OpenAI or generating audio');
    }
});

async function getAudio(text) {
    const res = await fetch(`${API_BASE_URL}/v1/audio/speech`, {
        method: "POST",
        body: JSON.stringify({
            input: `<speak>${text}</speak>`,
            voice_id: VOICE_ID,
            audio_format: "mp3",
        }),
        headers: {
            Authorization: `Bearer ${API_KEY}`,
            "content-type": "application/json",
        },
    });

    if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}\n${await res.text()}`);
    }

    const responseData = await res.json();
    const decodedAudioData = Buffer.from(responseData.audio_data, "base64");
    return decodedAudioData;
}

app.get('/speech.mp3', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', 0);
    res.sendFile(path.join(__dirname, 'public', 'speech.mp3'));
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
