# Issue:
- Cloud STT Azure/Soniox might be down or we might run into their limits
- Client bandwidth might be low

# Logical Changes:
- MicrophoneManager:
    - calculateRequiredData:
        New function to calculate the required data based on the subscriptions and cloud stt status.
- handleGlassesMessage (GlassesWebSocketService):
    - Modified to have a new endpoint for local transcriptions which will be relayed to the apps.
- New File For SherpaTranscriber:
    - Handle the logic of transcribing the audio chunks.
    - Would be initialized in SpeechRecAugmentos.
- SpeechRecAugmentos will have following changes:
    - sendTranscriptionToBackend: New state for transcription
    - initSherpaTranscriber: Initialize the transcriber
        - On receiving the audio chunks based on whether transcription is required or not it would send the audio chunks to the transcriber.
    - setPCMTranscriptionState: 
        - Would be triggered by microphonestatechange and based on bandwidth and required data would set the flags.
```java
    public boolean sendPcmToBackend = true;
    public boolean sendTranscriptionToBackend = true;

    initVadAsync();

    initSherpaTranscriber();

    setPCMTranscriptionState()
```

# New Flow:
Cloud side
- Cloud based on the cloud stt status and subscriptions calculates the required data types and sends it to the glasses along with the microphone state.
- Client after transcription triggers the new webhook endpoint to send the transcription to the apps.

Client side
- SpeechRecAugmentos will now have a transcriber intialised which will be triggered based on whether transcrition is necessary.
- In case of pcm_or_transcription client decides on the basis of its bandwidth.
- On glasses if required data contains transcription then local transcription is started and streamed to websockets.


# Current Limitations and Possible Issues:
- Improper required data state propagation because of debouncing.
- Cloud STT down logic is naive:
    - We just check if all cloud providers are unhealthy and if yes we mark cloud stt as down.
- There might be cases when the cloud STT status isn't synchronized with the glasses.
    - Currently sending cloud STT state change on:
        - Subscription changes from apps
        - Glasses connection state change
- Audio might be getting transcribed twice:
    - Might be some cases where local is transcribing and sending pcm as well.
    - Cloud handleAudio function currently has no way to know if transcription is already done or not.
- Transcription history corruption:
    - Before relaying the audio history is getting modified.
    - Since local transcription does do speaker diarization it sends single speaker id. Hence corruption.
- Currently local stt is hardcoded for english. Need to make it configurable.
- Cloud STT has multiple audio streams for different languages listening to the same audio data but local stt supports just one language.