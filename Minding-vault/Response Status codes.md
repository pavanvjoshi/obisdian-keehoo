
| Range | Meaning       | Simple Explanation                 |
| ----- | ------------- | ---------------------------------- |
| 1xx   | Informational | Request received, still processing |
| 2xx   | Success       | Everything worked                  |
| 3xx   | Redirection   | Go somewhere else                  |
| 4xx   | Client Error  | The request has a problem          |
| 5xx   | Server Error  | The server has a problem           |

* 100 :
	* The server says:
		* I've received your request headers. Continue sending the rest.

* 200:
	* 200 OK
		* request succeeded
	* 201 Created
		* new resource created
	* 202 Accepted
		* The request was accepted, but processing hasn't finished yet.
	* 204 No Content
		* The request succeeded, but there's nothing to return.
* 300
	* 301 Moved Permanently
		* The URL has permanently changed.
	* 302 Found
		* Temporary redirect.
		* Example:
			* Website temporarily sends users to another page.
	* 304 Not Modified
		* You already have the latest version
		* Used with browser caching.
* 400 Client error
	* These mean the client (browser, app, API caller) made a mistake.
	* 400 Bad Request:
		* when client sends invalid data(unexpected data)
	*  401 Unauthorized
		* client has failed to provide valid credentials or failed in authorization
	* 403 Forbidden
		* The user is authenticated but doesn't have permission.
	* 404 Not found
		* The requested resource doesn't exist.
			* User 999 doesn't exist.
	* 405 Method not allowed
		* invalid http method is used
		* The endpoint exists, but the HTTP method isn't supported.
	* 409 Conflict
		* The request conflicts with the current state.
	* 429 Too Many Requests
		* Rate limit exceeded.
			* You're sending requests too quickly.
* 500 Server Errors
	* 500 Internal error
		* A generic server-side error.
			* Example:
				- Null pointer exception
				- Database crash
				- Unexpected bug
	- 501 Not Implemented
		- The server doesn't support the requested functionality.
			- The endpoint exists, but that HTTP method or feature hasn't been implemented.
	- 502 Bad gateway
		- A gateway or proxy received an invalid response from an upstream server.
	- 503 service unavailable
		- The server is temporarily unavailable.
	- 504 Gateway Timeout
		- A gateway waited too long for an upstream server.