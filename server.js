const path = require('path');
const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs/promises');
const fetch = require('node-fetch');
const OpenAI = require('openai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const SPEECHIFY_API_KEY = "gYY2u8JgpciACjCGiazY2TjAwTBKi8yoKvK8-pciQQs=";
const API_BASE_URL = "https://api.sws.speechify.com";
const VOICE_ID = "713c0e16-b98f-415a-9f40-f19901851051";

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getLocation() {
  const response = await fetch("https://ipapi.co/json/");
  const locationData = await response.json();
  return locationData;
}

async function getCurrentWeather(latitude, longitude) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=apparent_temperature`;
  const response = await fetch(url);
  const weatherData = await response.json();
  return weatherData;
}

const tools = [
  {
    type: "function",
    function: {
      name: "getCurrentWeather",
      description: "Get the current weather in a given location",
      parameters: {
        type: "object",
        properties: {
          latitude: {
            type: "string",
          },
          longitude: {
            type: "string",
          },
        },
        required: ["longitude", "latitude"],
      },
    }
  },
  {
    type: "function",
    function: {
      name: "getLocation",
      description: "Get the user's location based on their IP address",
      parameters: {
        type: "object",
        properties: {},
      },
    }
  },
];

const availableTools = {
  getCurrentWeather,
  getLocation,
};

const messages = [
  {
    role: "system",
    content: `You are a helpful assistant named Jaevis. Only use the functions you have been provided with.`,
  },
];

async function agent(userInput) {
  messages.push({
    role: "user",
    content: userInput,
  });

  for (let i = 0; i < 5; i++) {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: messages,
      tools: tools,
    });

    const { finish_reason, message } = response.choices[0];

    if (finish_reason === "tool_calls" && message.tool_calls) {
      const functionName = message.tool_calls[0].function.name;
      const functionToCall = availableTools[functionName];
      const functionArgs = JSON.parse(message.tool_calls[0].function.arguments);
      const functionArgsArr = Object.values(functionArgs);
      const functionResponse = await functionToCall.apply(
        null,
        functionArgsArr
      );

      messages.push({
        role: "function",
        name: functionName,
        content: `
                The result of the last function was this: ${JSON.stringify(
                  functionResponse
                )}
                `,
      });
    } else if (finish_reason === "stop") {
      messages.push(message);
      return message.content;
    }
  }
  return "The maximum number of iterations has been met without a suitable answer. Please try again with a more specific input.";
}

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4',
      messages: messages,
      functions: tools.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      }))
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const assistantMessage = response.data.choices[0].message?.content;

    // Check if the response includes function calls
    if (response.data.choices[0].message?.function_call) {
      const functionName = response.data.choices[0].message.function_call.name;
      const functionToCall = availableTools[functionName];
      const functionArgs = JSON.parse(response.data.choices[0].message.function_call.arguments);
      const functionArgsArr = Object.values(functionArgs);
      const functionResponse = await functionToCall.apply(null, functionArgsArr);

      res.json({
        content: assistantMessage,
        functionResponse: functionResponse
      });
    } else {
      res.json({
        content: assistantMessage
      });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send("Error communicating with OpenAI API");
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
}

app.post('/api/synthesize', async (req, res) => {
  const { text } = req.body;

  try {
    const audio = await getAudio(text);
    await fs.writeFile("./public/speech.mp3", audio);
    res.json({ message: "Audio generated successfully" });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send("Error generating audio");
  }
});

app.get('/speech.mp3', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', 0);
  res.sendFile(path.join(__dirname, 'public', 'speech.mp3'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
