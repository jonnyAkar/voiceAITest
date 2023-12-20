const WebSocket = require("ws");
const express = require("express");
const app = express();
const server = require("http").createServer(app);
const axios = require('axios');
const { stringify } = require('flatted');
const { OpenAI } = require('openai');
const wss = new WebSocket.Server({ server });
const fs = require('fs');

const PROMPT = `Hello! You are a bot guiding someone 
with their medical needs.
You are nice and friendly. Give short answers and too the point.
No more than 100 words. Sound as human as possible, just like a flowing conversation.`;

const VOICE_PROMPT = `Hello, I will be assisting you today!`;

const UTTERENCES = [
  "hmm...one second",
  "hmm, okay one second",
  "okay, let me think about that"
];

const PLAY_BOOP = true;

const PLAY_UTTERENCE = false;

const PLAY_PROMPT = true;

// handle web socket connection
wss.on("connection", function connection(ws) {

  const conversation_history = [];
  let assembly;
  let sample_rate = 0;
  let gpt_key;
  let elleven_key;
  let assembly_key;
  let voice_id;
  let assemblyHasBeenInitialized = false;
  
  console.log("New Connection Initiated");
  //start prompt
  conversation_history.push({ "role": "user", "content": PROMPT});

  // handle client messages
  ws.on("message", function incoming(data, isBinary) {
    const message = isBinary ? data : data.toString();
    const parsed_json = JSON.parse(message);

    // check if the message is a configuration message
    if (parsed_json.type === 'config') {
      console.log("config: ", parsed_json);
      //assign keys
      sample_rate = parsed_json.sample_rate || sample_rate;
      gpt_key = parsed_json.openai_key || gpt_key;
      elleven_key = parsed_json.ellevenLabs_key || elleven_key;
      assembly_key = parsed_json.assembly_key || assembly_key;
      voice_id = parsed_json.voice_id || voice_id;
      
      if (PLAY_PROMPT){
        send_voice(VOICE_PROMPT,ws,elleven_key,voice_id);
      }
      
      if (assembly) {
        assembly.close(); 
      }
      initializeAssemblyAI();

    } 
    //handle audio message
    else {
      if (assemblyHasBeenInitialized && assembly.readyState == WebSocket.OPEN){
        assembly.send(message);
      }
      else if(assemblyHasBeenInitialized && assembly.readyState == WebSocket.CONNECTING){
        console.log("waiting for assembly connection");
      }
      else{
        console.log("assembly not properly initialized");
        //close ws with client
        ws.close(1000, "Closing connection"); 
      }
    }   
    
  });

  // handle end of ws session
  ws.on("close", function incoming(code, reason) {
    // log the message in real-time
    console.log("session ended");
    if (assemblyHasBeenInitialized){
      assembly.send(JSON.stringify({ terminate_session: true }));
      assembly.close()
    }
  });

  // handle ws errors
  ws.on("error", function (error) {
    console.error("WebSocket encountered an error:", error.message);
  });

  //initialize Assembly
  function initializeAssemblyAI() {
    assemblyHasBeenInitialized = true;
    assembly = new WebSocket(
      `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=${sample_rate}`,
      { headers: { authorization: assembly_key } }
    );
    //handle assembly close
    assembly.onclose = (closeEvent) => {
      console.log("assembly closing");
    }

    // handle assembly open
    assembly.onopen = (event) => {
      console.log("opening new assembly socket");
    }

    assembly.onerror = (ws,error) => {
      console.log("assembly error");
      ws.sendErrorMessage(ws,"assembly",error);
    }

    //handle assembly messages
    assembly.onmessage = (assemblyMsg) => {
      sendDebugMessage(ws, "assembly", assemblyMsg);
      const res = JSON.parse(assemblyMsg.data);
      
      //handle final transcript
      if (res['message_type'] == 'FinalTranscript'){
        conversation_history.push({"role": "user", "content": res.text})

        //random utterence
        if (Math.random() < 0.5 && PLAY_UTTERENCE) {
          let randIndex = Math.floor(Math.random() * UTTERENCES.length);
          send_voice(UTTERENCES[randIndex], ws, elleven_key, voice_id);
        }
        
        //play boop
        if (PLAY_BOOP){
          sendBoop(ws);
        }

        //get response
        get_response(conversation_history,ws, gpt_key, elleven_key, voice_id);
        
        
        console.log("TRANSCRIPTION: ",res.text);
      }
        
    }

  }

});

function get_response1(conversation_history,ws, gpt_key, elleven_key, voice_id){
  
  const url = 'https://api.openai.com/v1/chat/completions';

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${gpt_key}`
  };

  const data = {
    'model': 'gpt-3.5-turbo',
    'messages': conversation_history,
    'temperature': 0.7
  };

  axios.post(url, data, { headers })
    .then(response => {
      // Handle the response here
      
      const responseString = stringify(response);

      sendDebugMessage(ws, "openAI", responseString);

      const generatedText = response.data.choices[0].message.content;

      conversation_history.push({ "role": "system", "content": generatedText });
      console.log("RESPONSE: ", generatedText);
      send_voice(generatedText, ws, elleven_key,voice_id);
    })
    .catch(error => {
      // Handle errors here
      sendErrorMessage(ws, "openAI", error);
      console.error("openAI error: ",error);
    });
}

function send_voice1(text, ws, elleven_key, voice_id) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}/stream`;

  const headers = {
    "Accept": "audio/mpeg",
    "Content-Type": "application/json",
    "xi-api-key": elleven_key
  };

  const data = {
    "text": text,  
    "model_id": "eleven_monolingual_v1",
    "voice_settings": {
      "stability": 0.5,
      "similarity_boost": 0.5
    }
  };

  axios.post(url, data, { headers: headers , responseType: 'stream'})
  .then(response => {
    ws.send(JSON.stringify({message_type: 'event', message: 'sending audio'}))
    response.data.on('data', (chunk) => {
      //ws.send(chunk);
      ws.send(JSON.stringify({ message_type: 'audio_data', chunk: chunk }))
    });

    return new Promise((resolve, reject) => {
      response.data.on('end', resolve);
      response.data.on('error', reject);
    });
  })
  .then(() => {
    console.log('voice sent.');
    ws.send(JSON.stringify({message_type: 'event', message: 'audio sent'}))
  })
  .catch(error => {
    sendErrorMessage(ws, "ellevenLabs", error);
    console.error('elleven labs Error:', error.response);
  });
}

async function get_response(conversation_history, ws, gpt_key, elleven_key, voice_id) {
  const openai = new OpenAI({
    apiKey: gpt_key,
  });
  try{
    const stream = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: conversation_history,
      stream: true,
    });
    
    let sentence = ""; // temporary string to store the sentence

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      sentence += content; // append content to the sentence

      // check if the sentence ends
      if (sentence.endsWith('.') || sentence.endsWith('!') || sentence.endsWith('?')) {
        console.log("SENTENCE: ", sentence);
        conversation_history.push({ "role": "system", "content": sentence});
        await send_voice(sentence, ws, elleven_key, voice_id); // wait for send_voice to complete
        sentence = ""; // reset the sentence for the next one
      }
    }
    if (PLAY_BOOP){
      sendBoop(ws);
    }
  }catch(error){
    console.log("error gpt: ",error);
  }
}

function send_voice(text, ws, elleven_key, voice_id) {
  return new Promise((resolve, reject) => {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}/stream`;

    const headers = {
      "Accept": "audio/mpeg",
      "Content-Type": "application/json",
      "xi-api-key": elleven_key
    };

    const data = {
      "text": text,  
      "model_id": "eleven_monolingual_v1",
      "voice_settings": {
        "stability": 0.5,
        "similarity_boost": 0.5
      }
    };

    axios.post(url, data, { headers: headers , responseType: 'stream'})
    .then(response => {
      ws.send(JSON.stringify({message_type: 'event', message: 'sending audio'}));
      response.data.on('data', (chunk) => {
        ws.send(JSON.stringify({ message_type: 'audio_data', chunk: chunk }));
      });

      response.data.on('end', () => {
        console.log('voice sent.');
        ws.send(JSON.stringify({message_type: 'event', message: 'audio sent'}));
        resolve();
      });

      response.data.on('error', (error) => {
        sendErrorMessage(ws, "ellevenLabs", error);
        console.error('elleven labs Error:', error.response);
        reject(error);
      });
    })
    .catch(error => {
      sendErrorMessage(ws, "ellevenLabs", error);
      console.error('elleven labs Error:', error.response);
      reject(error);
    });
  });
}

// send debug message
function sendDebugMessage(ws, API, message) {
  ws.send(JSON.stringify({ message_type: 'debug', API: API, message: message }));
}

// send error message
function sendErrorMessage(ws, API, error) {
  ws.send(JSON.stringify({ message_type: 'error', API: API, message: error }));
}

function sendBoop(ws){

  const stream = fs.createReadStream('static/bubble-sound-43207.mp3', { highWaterMark: 1024 }); 
  
  ws.send(JSON.stringify({message_type: 'event', message: 'sending audio'}))

  stream.on('data', function(chunk) {
    ws.send(JSON.stringify({ message_type: 'audio_data', chunk: chunk }));
  });

  stream.on('end', function() {
    ws.send(JSON.stringify({message_type: 'event', message: 'audio sent'}))
  });

  stream.on('error', function(err) {
    ws.send(JSON.stringify({ message_type: 'error', message: err.message }));
    console.error('boop error:', err);
  });
}

server.listen(8080);

