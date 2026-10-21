When agent depends always on VAD, while talking to agent if we pause in middle of conversation it assumes the user has stopped talking.  There comes **Semantic Turn detection.**


## Turn Detection:

1. Reduces unwanted interruptions
2. improves STT accuracy
3. ~20ms latency impact. 


## Best Practice:

1. combine with VAD
2. Language aware pause handling
3. works with preemptive generation. 
	1. (Preemptive generation is a technique where an AI system starts generating likely outputs **before** the user fully finishes an action or before all information is available.)


## Ideas for testing

1. short sentences vs long pauses
2. background noise 
3. mid-sentence language switch