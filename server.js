require("dotenv").config();
const OpenAI = require('openai');
const path = require('path');
const express = require('express');
const axios = require('axios');
const fs = require('fs/promises');
const {response} = require("express");

const { OPENAI_API_KEY, ASSISTANT_ID, SERPAPI_KEY, NEISAPI_KEY, TIMEZONEDB_KEY } = process.env;

const { getJson } = require("serpapi");

// const SPEECHIFY_API_KEY = "gYY2u8JgpciACjCGiazY2TjAwTBKi8yoKvK8-pciQQs=";
// const API_BASE_URL = "https://api.sws.speechify.com";
// const VOICE_ID = "713c0e16-b98f-415a-9f40-f19901851051";

const TDB_API_URL = "http://api.timezonedb.com/v2.1/get-time-zone"

// Setup Express
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Set up OpenAI Client
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
});
let assistantMessage;
const assistantId = ASSISTANT_ID;
let pollingInterval;


async function getSearchResult(query) {
    try {
        console.log('------- CALLING AN EXTERNAL API ----------');
        const json = await getJson({
            engine: "google",
            api_key: SERPAPI_KEY,
            q: query,
            location: "Paju-si, Gyeonggi-do, South Korea",
        });

        // Extract the first two search results
        const firstTwoResults = json.organic_results.slice(0, 2).map(result => ({
            position: result.position,
            title: result.title,
            link: result.link,
            snippet: result.snippet,
        }));

        return firstTwoResults;
    } catch (error) {
        console.error('Error in getSearchResult:', error);
        throw error; // Rethrow the error to be handled by the calling function
    }
}

async function getCurrentTime() {
    try {
        const url = `${TDB_API_URL}?key=${TIMEZONEDB_KEY}&format=json&by=zone&zone=Asia/Seoul`;
        const response = await axios.get(url);
        const dateTime = response.data.formatted;
        const formattedDate = dateTime.split(' ')[0].replace(/-/g, '').replace(/"/g, '');
        return formattedDate;
    } catch (error) {
        console.error('Error in getCurrentTime:', error);
        throw error; // Rethrow the error to be handled by the calling function
    }
}


async function getMealInfo(pIndex) {
    try {
        const date = await getCurrentTime();
        console.log('Date:', date);
        const url = `https://open.neis.go.kr/hub/mealServiceDietInfo?KEY=${NEISAPI_KEY}&ATPT_OFCDC_SC_CODE=J10&SD_SCHUL_CODE=${pIndex}&MLSV_YMD=${date}&type=json&MMEAL_SC_CODE=2`;
        const response = await axios.get(url);
        const mealInfo = response.data;

        // Enhanced error handling and logging
        console.log('API Response:', JSON.stringify(mealInfo, null, 2));

        if (mealInfo && mealInfo.mealServiceDietInfo && mealInfo.mealServiceDietInfo.length > 0 && mealInfo.mealServiceDietInfo[1].row && mealInfo.mealServiceDietInfo[1].row.length > 0) {
            const mealData = mealInfo.mealServiceDietInfo[1].row[0];
            return [mealData.DDISH_NM, mealData.CAL_INFO];
        } else {
            throw new Error('Unexpected API response structure');
        }
    } catch (error) {
        console.error('Error in getMealInfo:', error);
        if (error.response) {
            console.error('API response data:', error.response.data);
        }
        throw error; // Rethrow the error to be handled by the calling function
    }
}


// Example usage:
(async () => {
    try {
        const mealInfo = await getMealInfo('7530969');
        console.log('Meal Info:', mealInfo);
    } catch (error) {
        console.error('Error while fetching meal info:', error);
    }
})();



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

async function runAssistant(threadId) {
    console.log('Running assistant for thread: ' + threadId);
    const response = await openai.beta.threads.runs.create(
        threadId,
        {
            assistant_id: assistantId
            // Make sure to not overwrite the original instruction, unless you want to
        }
    );

    console.log(response);

    return response;
}


async function checkingStatus(res, threadId, runId, resolve) {
    try {
        const runObject = await openai.beta.threads.runs.retrieve(threadId, runId);
        const status = runObject.status;
        console.log(runObject);
        console.log('Current status: ' + status);

        if (status === 'completed') {
            clearInterval(pollingInterval);

            const messagesList = await openai.beta.threads.messages.list(threadId);
            let messages = [];

            messagesList.body.data.forEach(message => {
                messages.push(message.content);
            });

            // Assuming you want the first message in the messages array
            const assistantMessage = messages.length > 0 ? messages[0] : null;

            resolve(assistantMessage);
        } else if (status === 'requires_action') {
            console.log('requires_action.. looking for a function');

            if (runObject.required_action.type === 'submit_tool_outputs' && status !== 'queued') {
                console.log('submit tool outputs ... ');
                const tool_calls = runObject.required_action.submit_tool_outputs.tool_calls;

                if (tool_calls && tool_calls.length > 0) {
                    const parsedArgs = JSON.parse(tool_calls[0].function.arguments);
                    console.log('Parsed arguments: ', parsedArgs);

                    try {
                        let toolOutputs = [];

                        if (parsedArgs.query) {
                            console.log('Query to search for: ' + parsedArgs.query);
                            const apiResponse = await getSearchResult(parsedArgs.query);

                            toolOutputs.push({
                                tool_call_id: tool_calls[0].id,
                                output: JSON.stringify(apiResponse),
                            });
                        } else if (parsedArgs.pIndex) {
                            console.log('pIndex for meal info: ' + parsedArgs.pIndex);
                            const apiMealInfo = await getMealInfo(parsedArgs.pIndex);

                            toolOutputs.push({
                                tool_call_id: tool_calls[0].id,
                                output: JSON.stringify(apiMealInfo),
                            });
                        } else {
                            console.error('Error: neither query nor pIndex is present in parsed arguments');
                        }

                        if (toolOutputs.length > 0) {
                            const run = await openai.beta.threads.runs.submitToolOutputs(
                                threadId,
                                runId,
                                {
                                    tool_outputs: toolOutputs
                                }
                            );

                            console.log('Run after submit tool outputs: ' + run.status);
                        }
                    } catch (error) {
                        console.error('Error while handling required action:', error);
                    }
                } else {
                    console.error('Error: tool_calls are not in the expected format or missing arguments');
                }
            }
        }
    } catch (error) {
        console.error('Error in checkingStatus:', error);
    }
}




// // Function to generate speech audio
// async function getAudio(text) {
//     const res = await fetch(`${API_BASE_URL}/v1/audio/speech`, {
//         method: "POST",
//         body: JSON.stringify({
//             input: `<speak>${text}</speak>`,
//             voice_id: VOICE_ID,
//             audio_format: "mp3",
//         }),
//         headers: {
//             Authorization: `Bearer ${SPEECHIFY_API_KEY}`,
//             "content-type": "application/json",
//         },
//     });
//
//     if (!res.ok) {
//         throw new Error(`${res.status} ${res.statusText}\n${await res.text()}`);
//     }
//
//     const responseData = await res.json();
//     const decodedAudioData = Buffer.from(responseData.audio_data, "base64");
//     return decodedAudioData;
// }

async function getVectorStore() {
    const vectorStore = await openai.beta.vectorStores.retrieve(
        "vs_KGibfjRUrmdmLjKeaOQ5alXY"
    );
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
// app.post('/message', async (req, res) => {
//     const { message, threadId } = req.body;
//     try {
//         const addedMessage = await addMessage(threadId, message);
//         const run = await runAssistant(threadId);
//         const runId = run.id;
//
//         pollingInterval = setInterval(async () => {
//             await checkingStatus(res, threadId, runId);
//         }, 5000);
//
//         const assistantMessageContent = addedMessage.content.find(c => c.type === 'text');
//         const assistantMessage = assistantMessageContent?.text?.value;  // Safe navigation to avoid undefined errors
//
//         if (!assistantMessage) {
//             throw new Error('Assistant message is undefined or malformed');
//         }
//
//         // Generate the speech audio file using Speechify
//         const audio = await getAudio(assistantMessage);
//         await fs.writeFile("./public/speech.mp3", audio);
//
//         res.json({ message: assistantMessage });
//     } catch (error) {
//         console.error('Error:', error);
//         res.status(500).json({ error: 'Failed to process message' });
//     }
// });

// app.post('/message', (req, res) => {
//     const { message, threadId } = req.body;
//     addMessage(threadId, message).then(message => {
//         // res.json({ messageId: message.id });
//
//         // Run the assistant
//         runAssistant(threadId).then(async run => {
//             const runId = run.id;
//
//
//                     // Generate the speech audio file using Speechify
//
//
//             // Check the status
//             pollingInterval = setInterval(() => {
//                 checkingStatus(res, threadId, runId);
//             }, 5000);
//             console.log(assistantMessage);
//             const audio = await getAudio(assistantMessage);
//             await fs.writeFile("./public/speech.mp3", audio);
//
//             res.json({message: assistantMessage})
//
//         });
//
//
//     });
// });

app.post('/message', (req, res) => {
    const { message, threadId } = req.body;
    addMessage(threadId, message).then(() => {
        // res.json({ messageId: message.id });

        // Run the assistant
        runAssistant(threadId).then(run => {
            const runId = run.id;

            // Check the status with polling and use a promise to handle completion
            new Promise((resolve) => {
                pollingInterval = setInterval(() => {
                    checkingStatus(res, threadId, runId, resolve);
                }, 10000);
            }).then(async (assistantMessage) => {
                // const speechMessageJson = assistantMessage[0].text.value;
                // const speechMessage = JSON.stringify(speechMessageJson);
                // const audio = await getAudio(speechMessage);
                // await fs.writeFile("./public/speech.mp3", audio);
                res.json({message: assistantMessage});
            });
        });
    });
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


app.post('/search', (req, res) => {
    getSearchResult(req.body.query).then(r =>
        res.json(r));
})


app.get('/mealinfo', (req, res) => {
    getMealInfo().then(r =>
        res.json(r));
});