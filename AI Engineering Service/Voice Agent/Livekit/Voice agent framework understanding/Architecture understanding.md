![[Architecture understanding 2026-05-13 09.52.02.excalidraw]]
### **Who does what?**

#### 1. Google Gemini is brain. 
It handles:
1. STT
2. LLM
3. TTS
Model used is `gemini-3.1-flash-live-preview`
#### 2. Silero VAD
#### 3. Livekit's Role

LiveKit is the **plumbing**.
Think of it like this:

```
User's mic → [LiveKit moves audio] → [Gemini processes everything] → [LiveKit moves audio back] → User's speaker
```

## Why Both?

You need LiveKit because Gemini Live doesn't handle WebRTC, room management, or multi-user sessions. LiveKit solves the real-time transport problem. Gemini solves the intelligence problem.


