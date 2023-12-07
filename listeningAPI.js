const WebSocket = require("ws");
const express = require("express");
const path = require("path")
const app = express();
const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server });

const API_KEY = process.env.ASSEMBLY_API;

let assembly = new WebSocket(
  "wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000",
  { headers: { authorization: API_KEY } }
);

let count = 0;

// Handle Web Socket Connection
wss.on("connection", function connection(ws) {
  console.log("New Connection Initiated");
  const texts = {};
  assembly.onmessage = (assemblyMsg) => {
    const res = JSON.parse(assemblyMsg.data);
    texts[res.audio_start] = res.text;
    const keys = Object.keys(texts);
    keys.sort((a, b) => a - b);
    let msg = '';
    for (const key of keys) {
      if (texts[key]) {
        msg += ` ${texts[key]}`;
      }
    }
    console.log(msg);
    wss.clients.forEach( client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            event: "interim-transcription",
            text: msg
          })
        );
      }
    });
    
  }

  // Handle incoming binary data (audio chunks)
  ws.on("message", function incoming(data, isBinary) {
    // Log the message in real-time
    const message = isBinary ? data : data.toString();
    //console.log(message);
    count += 1;
    const parsed_json = JSON.parse(message);
    console.log(count, " : ",parsed_json['audio_data'].substr(0,5));
    assembly.send(message);
    
  });

});

//Handle HTTP Request
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "templates/index1.html")));


server.listen(8080);
