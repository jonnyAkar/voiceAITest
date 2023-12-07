import websocket
import pyaudio
import json
import base64

# Your WebSocket server URL
WS_URL = "ws://https://listeningapi.onrender.com/"

FRAMES_PER_BUFFER = 3200
FORMAT = pyaudio.paInt16
CHANNELS = 1
SAMPLE_RATE = 16000
p = pyaudio.PyAudio()

# Start recording
stream = p.open(
    format=FORMAT,
    channels=CHANNELS,
    rate=SAMPLE_RATE,
    input=True,
    frames_per_buffer=FRAMES_PER_BUFFER
)

def on_open(ws):
    while True:
        # Read audio data from the microphone
        data = stream.read(FRAMES_PER_BUFFER)

        # Encode the raw data into base64
        data = base64.b64encode(data).decode("utf-8")

        # Follow the message format of the Real-Time service (see documentation)
        json_data = json.dumps({"audio_data": str(data)})
        
        # Send the data over the WebSocket
        parsed_data = json.loads(json_data)

        ws.send(json_data)


# Set up the WebSocket connection with your desired callback functions
websocket.enableTrace(False)

# Create a WebSocket connection
ws = websocket.WebSocketApp(WS_URL, on_open=on_open)

# Start the WebSocket listener in a separate thread
ws.run_forever()

