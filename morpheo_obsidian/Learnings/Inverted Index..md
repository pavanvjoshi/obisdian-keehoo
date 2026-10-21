### Inverted Index for document search

A way to organize the data in the memory.
It's like creating a phone book where instead of looking up names to find numbers, you look up numbers to find names.
Inverted indexing is a data structure that maps each term to the list of documents.

**Simple analogy:**
Imagine you have three books and want to find all books that mention "cats." 
Without an inverted index, you'd have to flip through every single page of all three books. 
With an inverted index, you just look up "cats" in your index and it tells you: "Book 1, page 5" and "Book 3, page 12".

What it is:
An inverted index is basically a dictionary where:
* Key: Each word (like "apple", "dog", "performance")
* Value: List of document/places where that word appears.

Why name "inverted"?
Normally, we think: "Document A contains words X,Y,Z".
An inverted index flips this to: "Word X appears in documents A and C".

**When you process documents, the system builds an inverted index:**

```
Token -> Document List
"customer" -> [doc1, doc5, doc12, doc45]
"database" -> [doc3, doc8, doc12, doc23]  
"schema" -> [doc2, doc8, doc15, doc45]
```

