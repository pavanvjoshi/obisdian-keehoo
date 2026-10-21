
## production workflows

1. collect recording consent
2. escalate to humans
3. handoff between agents
4. preserve context


**Consent:**

*  We can add **consent** using `CollectConsent` in voice agent so that it keeps track in production level.

**Escalation:**

* you can use escalate tool if user have requested or agent cannot solve that issue. 
* we can send the context what has happened before the escalation between the user and the agent. 

**Multi step workflow:**

* `TaskGroup` can handle multiple steps such as collecting email, number and sending any messages. 


==***Ultimate Warm hand-off to human agent  may face little complex.***==



![[Pasted image 20260507112901.png]]




### complete production flow.

1. consent task
2. triage agent (agent which decides what to call or what to do)
3. specialised agent
4. manager escalation
5. human handoff.


