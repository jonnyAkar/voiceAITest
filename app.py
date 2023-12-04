from flask import Flask, request, render_template, jsonify
import requests
import time
import os

app = Flask(__name__)

OPENAI_API_KEY = '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'
CHUNK_SIZE = 1024


# Store conversation history in a global variable
conversation_history = []
timestamp = 0

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        user_input = request.form['user_input']

        global timestamp
        # Get the latest timestamp from the conversation_history
        timestamp = int(time.time())

        # Add user input to the conversation history
        conversation_history.append({"role": "user", "content": user_input})

        # Get response from ChatGPT
        response_content = send_to_chatgpt(conversation_history, timestamp)

        # Add ChatGPT's response to the conversation history
        conversation_history.append({"role": "assistant", "content": response_content})

        
    return render_template('index.html', conversation_history=conversation_history, 
    filename=f'static/output_{timestamp}.mp3')

def send_to_chatgpt(conversation, timestamp):
    url = "https://api.openai.com/v1/chat/completions"
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}"
    }

    data = {
        "model": "gpt-3.5-turbo",
        "messages": conversation,
        "temperature": 0.7
    }

    response = requests.post(url, json=data, headers=headers)

    if response.status_code == 200:
        json_response = response.json()
        content = json_response["choices"][0]["message"]["content"]
        play_voice(content, timestamp)
        return content
    else:
        try:
            error_message = response.json()["error"]["message"]
        except (KeyError, ValueError):
            error_message = "Unknown error occurred"

        return error_message

def play_voice(text, timestamp):
    url = "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM"

    headers = {
    "Accept": "audio/mpeg",
    "Content-Type": "application/json",
    "xi-api-key": "83ffeb2fa5c17063285f79bba7827f0e"
    }

    data = {
    "text": text,
    "model_id": "eleven_monolingual_v1",
    "voice_settings": {
        "stability": 0.5,
        "similarity_boost": 0.5
    }
    }

    response = requests.post(url, json=data, headers=headers)

    filename = f'static/output_{timestamp}.mp3'

    with open(filename, 'wb') as f:
        for chunk in response.iter_content(chunk_size=1024):
            if chunk:
                f.write(chunk)
 
@app.route('/handle_refresh')
def handle_refresh():
    # Handle the refresh on the server side
    global conversation_history
    conversation_history = []

    folder_path = 'static/' 

    try:
        # Loop through all files in the folder
        for filename in os.listdir(folder_path):
            file_path = os.path.join(folder_path, filename)
            os.remove(file_path)
    except Exception as e:
        return f'Error: {str(e)}'

    return 'handled'

if __name__ == '__main__':
    app.run(debug=True)
