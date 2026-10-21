## Metrics: What we actually measure?

1. TTFA (time to first audio) - How long it takes before you hear the AI start speaking.
2. TTFT (time to first token) - How long it takes before the AI starts generating the first piece of text.
3. token usage and cost
4. interruption rate
5. fallback activation

## Preemptive generation tradeoffs

1. Mid sentence direction changes
2. complex multi-part instructions
3. high - accuracy domains


***While deploying enable the agent observability*** so that it can maintain the history of the conversation in the cloud which we have deployed. We can also disable it in the code if we don't want to record. 

we can use this to validate and fine tune voice agent. 

#### Data retention:

1. 30 - day retention window
2. automatic deletion of after 30 days


## Latency optimisation:

1. stream everything(STT, LLM , TTS)
2. Parallelize STT -> LLM -> TTS (do not wait until completion of any node.)
3. aviod blocking I/O - keep tool call, async
4. keep prompts tight
