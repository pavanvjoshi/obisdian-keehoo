BM 25 is the powerful **ranking algorithm** used in information retrieval.

It calculates how relevant a document is to search query based on:
1. **Term frequency:** How often search term are across all documents.
2. **Inverse Document Frequency:** how rare/common the terms are across all documents.
3. **Document Length:** Adjusts for document size.


**What BM25 Does?**

BM25 calculates a relevance score for each document based on how well it matches your search query. Think of it as a judge scoring documents on a scale the higher the score the more relevant the document is to what you are looking for.


**The BM25 Formula**
The algorithm uses two key parameters:
1. k1 (typically 1.2 - 2.0): Controls how much term frequency matters
2. b (typically 0.75): controls how much document length affects the score.