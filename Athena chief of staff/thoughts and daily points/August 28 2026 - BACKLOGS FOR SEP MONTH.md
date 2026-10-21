
**External dependencies:**

1. IAM metrics creation - assigned to PMO role (RBAC)
	1. Dependencies
		1. routing fix
	2. reconcilation approach
		1. when the data gets deleted in IAM database, need to preserve the exisiting data.
2. DevOps
	1. Sandbox code execution. 

**Development backlogs:**

1. Operational fixes:
	1. Calendar alignment
	2. signal report optimisation
		1. currently it is too verbose
	3. Application name and icon migration
		1. athena to Kruise COS
		2. newly generated logo
	4. CSS alignment with IIP hub
2. dev fixes:
	1. Adhoc management
		1. We need to have mechanism to accommodate the Adhoc tasks. 
			1. as we have observed no data being mapped or collected.
	2. model migration - **PRIORITY**
		1. prompt optimisation 
		2. token monitoring - **PRIORITY**
		3. latency
			1. subjected to reasoning effort and subjected to individual nodes reasoning effort. 
				1. think of how to engage user. 
					1. some text in the response till overall completeion of the execution. 
		4. prompt caching
		5. agent iteration cap - **COMPLETED needs observation(dynamic agents spawn solved this issue)**
		6. data information in response - **COMPLETED**
			1. think of department level dynamic agent spawning. 
		7. context node (for second turn)
			1. first time it is fine but for the second turn need to gather all the context instead of passing only the last chat response. 
		8. data storage redundancy
			1. need to think on storing data that eases in retriveal 
				1. blob
				2. qdrant
				3. postgres
		9. monthly plan ingestion in application (just thoughts)
		10. dynamic milestone frequency selection
			1. currently it is fixed to weekly
	3. Execution engine improvement.
		1. extraction
		2. ingestion



## Model latency and token optmisation

1. Prompt caching
2. prompt optimsiation