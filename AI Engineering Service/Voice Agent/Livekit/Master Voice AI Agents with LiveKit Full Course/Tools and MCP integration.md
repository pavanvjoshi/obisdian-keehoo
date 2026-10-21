Use decorator `@function_tool()`  to invoke the function tool. 

**Run context:**
this contain access to the current session, function call, speech handle and user data. 


### Best practices

1. be specific in the descriptions
2. keep tools fast (<2 seconds)
3. handle errors with tool error
4. return meaningful data.


#### If there are any long running tool. 

* in function tool we can add the talks like "let me search", "let me look into it" etc,.
`await context.session.say("Let me look into it..")`

* When there is such a tools that need not to be interrupted we can do that tool level. `context.disallow_interruptions()`.
	* for example if the tool is related to payment method or any irreversible tool function. 
* We can also add or remove on real time based on conversation state.
 ```python
 
 # Add a tool dynamically
 await agent.update_tools(agent.tools + [new_tool])
	  

 # remove a tool
 await agent.update_tools(agent.tools - [old_tool])
 ```
