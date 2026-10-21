I am building a framework for voice agent using live kit in production level. Instead of directly integrating everything once in this framework we will go on adding the features one by one, first we will build one simple console level voice agent(works in only console). No UI, i want to use python 3.11+ tech stack using hexagonal architecture.

  

This AI Voice agent is specially building for my another temple related SaaS application where devotees will ask queries or any other things, in future i will integrate the tools related to that SaaS. I may also integrate MCP, or i may add SOP for file search(file search feature is available in livekit). Everytime i say anything to implement do not assume anything directly instead make the websearch refer to any github code or directly refer to offical documentation of livekit. (https://docs.livekit.io/intro/overview/). If you are not confident in anything stop right there and start asking questions.

  

I am also adding multilingual feature in this agent at the start only. I want to use gemini 3.1 flash model for LLM. For STT or TTS you use related ids' so that it doesnt break the things. As in For kannada language you can use different model which has efficiency in kannada language.

  

When it comes to multi-lingual i am feeling the better option is to make separate model calls for all the languages(my priority languages are English, Hindi and Kannada) by asking user to which language to start with or if there is any other better approach suggest me before implementation.

  

Make the system prompt tight, make use of semantic detection by combining with VAD, emotion control, keep replies brief and for production i want to implement collecting consent, escalation, multi-step workflow.

  

Add clean logs for metrics, the metrics are TTFA, TTFT, token usage and cost, interruption rate, fallback activation.

  
  

In future i am plug this framework into mentioned saas application.

  

If you want to know anything about implementation refer to this youtube video [https://www.youtube.com/watch?v=n-hCOsVQQgA]

Make a simple readable README.md file where other devs can understand easily and everytime if there misalignment in the code and readme file make sure to update this file.