Agent will scrape the emails or phone numbers of any organization or person who can buy the product, after scraping create an email template and send them the email. For every 10 minutes check the inbox whether any sent mail has got a response or not. If there is some response we need to notify by sending sms/email. 

1. Make an simple and clean chat application, where it asks about the product. 
2. After having better context of the product, ask for any demo videos, deployed trail application link, or any other information. 
3. Then according to the product scrape the web the get the contact information.
4. Create a professional product pitch email template by attaching the given link or any videos or images and send them.
5. This is one cycle, for every 10 minutes we again check our inbox whether any of the mail got response back, if yes agent should notify to the application owner(me by call/mail/sms etc..)
6. Maintain every information in the database use postgres as SQL database.
7. Use langchain's create_agent to build that agent.
8. You can use langgraph for the flow execution
9. Do not assume anything, if you are not confident stop there and ask for the questions then proceed.




### Heads-up before building it.

1. Scraping emails/phones without consent violates DPDP Act(India), GDPR, CAN-SPAM(US).. Cold emailing scraped contacts can get your domain blacklisted and expose the company to legal risk. 
	1. **Alternative:** use legitimate B2B data APIs instead of raw scraping.
		1. hunter.io
		2. apollo.io
		3. clearbit



### Updates:

1. Raw Scraping email violates Indian act, so we can use legitimate B2B data APIs
2. Found scraping api's which are specifically built for finding emails of any domain, or any orgnaization. 
3. Able to get the contacts on domain level, need to work on dynamic search method.
4. Happy path is completed, from product knowledge to sending the email to contacts.
