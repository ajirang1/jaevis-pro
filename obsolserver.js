// Required dependencies
require("dotenv").config();
const OpenAI = require('openai');
const path = require('path');
const express = require('express');
const axios = require('axios');
const fs = require('fs/promises');

const { OPENAI_API_KEY, ASSISTANT_ID } = process.env;
const SPEECHIFY_API_KEY = "gYY2u8JgpciACjCGiazY2TjAwTBKi8yoKvK8-pciQQs=";
const API_BASE_URL = "https://api.sws.speechify.com";
const VOICE_ID = "713c0e16-b98f-415a-9f40-f19901851051";

// Setup Express
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Set up OpenAI Client
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
});

const assistantId = ASSISTANT_ID;
let pollingInterval;

// Function to create a new thread
async function createThread() {
    try {
        const thread = await openai.beta.threads.create();
        return thread;
    } catch (error) {
        console.error('Error creating thread:', error);
        throw error;
    }
}

// Function to add a message to a thread
async function addMessage(threadId, message) {
    try {
        const response = await openai.beta.threads.messages.create(threadId, {
            role: "user",
            content: message
        });
        return response;
    } catch (error) {
        console.error('Error adding message:', error);
        throw error;
    }
}

// Function to run the assistant
async function runAssistant(threadId) {
    try {
        const response = await openai.beta.threads.runs.create(threadId, {
            assistant_id: assistantId
        });
        return response;
    } catch (error) {
        console.error('Error running assistant:', error);
        throw error;
    }
}

// Function to check the status of a run
async function checkingStatus(res, threadId, runId) {
    try {
        const runObject = await openai.beta.threads.runs.retrieve(threadId, runId);
        const status = runObject.status;
        console.log('Current status:', status);

        if (status === 'completed') {
            clearInterval(pollingInterval);
            const messagesList = await openai.beta.threads.messages.list(threadId);
            const messages = messagesList.body.data.map(message => message.content);
            res.json({ messages });
        }
    } catch (error) {
        console.error('Error checking status:', error);
    }
}

// Function to generate speech audio
async function getAudio(text) {
    try {
        const res = await fetch(`${API_BASE_URL}/v1/audio/speech`, {
            method: "POST",
            body: JSON.stringify({
                input: `<speak>${text}</speak>`,
                voice_id: VOICE_ID,
                audio_format: "mp3",
            }),
            headers: {
                Authorization: `Bearer ${SPEECHIFY_API_KEY}`,
                "content-type": "application/json",
            },
        });

        if (!res.ok) {
            throw new Error(`${res.status} ${res.statusText}\n${await res.text()}`);
        }

        const responseData = await res.json();
        const decodedAudioData = Buffer.from(responseData.audio_data, "base64");
        return decodedAudioData;
    } catch (error) {
        console.error('Error generating audio:', error);
        throw error;
    }
}

// Route to create a new thread
app.get('/thread', async (req, res) => {
    try {
        const thread = await createThread();
        res.json({ threadId: thread.id });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create thread' });
    }
});

// Route to handle messages
app.post('/message', async (req, res) => {
    const { message, threadId } = req.body;
    try {
        await addMessage(threadId, message);
        const run = await runAssistant(threadId);
        const runId = run.id;

        pollingInterval = setInterval(async () => {
            await checkingStatus(res, threadId, runId);
        }, 5000);
    } catch (error) {
        res.status(500).json({ error: 'Failed to process message' });
    }
});

// Route to serve the speech audio file
app.get('/speech.mp3', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', 0);
    res.sendFile(path.join(__dirname, 'public', 'speech.mp3'));
});

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
