import websocket
import pyaudio
import json
import base64
from threading import Thread
from playsound import playsound 

# Your WebSocket server URL
WS_URL = "ws://localhost:8080/"

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
    input=True
)

voices = [
    {"name": "Markus", "id": 'KsR3fNaOU5fFwTN40eqd'},
    {"name": "Knightley", "id": 'kfYT201R2DjkbFrWRfUG'},
    {"name": "Sara", "id": '21m00Tcm4TlvDq8ikWAM'},
]

voice_id = voices[0]['id']

def on_error(ws, error):
    """
    is being called in case of errors
    """
    print(error)

def on_open(ws):

    with open('output.mp3', 'wb') as f:
        pass 
    print(voices[0]['id'])
    configMessage = {
        "type": "config",
        "sample_rate": 16000,
        "assembly_key": "4b4791c0896e4f1ea23e5fc97ada6056",
        "openai_key": "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",
        "ellevenLabs_key": "83ffeb2fa5c17063285f79bba7827f0e",
        "voice_id": voice_id
    }

    ws.send(json.dumps(configMessage))

    def send_data():
        while True:
            # Read audio data from the microphone
            data = stream.read(FRAMES_PER_BUFFER, exception_on_overflow = False)

            # Encode the raw data into base64
            data = base64.b64encode(data).decode("utf-8")

            # Follow the message format of the Real-Time service (see documentation)
            json_data = json.dumps({"audio_data": str(data)})
            
            # Send the data over the WebSocket
            parsed_data = json.loads(json_data)

            ws.send(json_data)
    
    Thread(target=send_data).start()

def on_message(ws, message):
    """
    is being called on every message
    """
    parsed_data = json.loads(message)

    type = parsed_data['message_type']
    
    if (type == 'audio_data'):
        chunk = parsed_data['chunk']
        byte_data = bytes(chunk['data'])
        with open('output.mp3', 'ab') as f:  # Append mode for binary
            f.write(byte_data)

    elif (type == 'debug'):
        None
        #print(message)

    elif (type == 'error'):
        None
        #print(message)

    elif (type == 'event'):
        # Handle text message
        if (parsed_data['message'] == "sending audio"):
            print("clearing mp3")
            with open('output.mp3', 'wb') as f:
                pass
        elif (parsed_data['message'] == "audio sent"):
            print("speaking")
            stream.stop_stream()
            playsound('output.mp3')
            stream.start_stream()
      

    
# Set up the WebSocket connection with your desired callback functions
websocket.enableTrace(False)

# Create a WebSocket connection
ws = websocket.WebSocketApp(WS_URL, on_open=on_open, on_message=on_message, on_error=on_error)

# Start the WebSocket listener in a separate thread
ws.run_forever()

