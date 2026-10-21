
### Below are the methods designed for comparing the two specific strings.

1. Exact string matching
	1. direct column name comparisons
	2. case - sensitive and case - insensitive variants
2. Fuzzy string matching
	1. Levenshtein distance - handles typos, slight variations
	2. Jaro - winkler - better for names with common prefixes
		1. apple - apple (1.00)
		2. apple - apply (0.933)
		3. kitten - sitting (0.7467)

### Below are the methods designed for searching through the documents/text collections but not direct strings comparisons.

1. Best matching 25 (BM 25)
	1.  It is Ranking function, querying the relevant document
	2. uses term frequency(TF) with saturation - _prevents over-weighting of terms that appear many times_
	3. Incorporates inverse document frequency (IDF) - _to reduce weight of common terms_.
2. Inverted Index
	1. It is a data structure that maps each unique term in a document collection to a list of documents containing the term, along with metadata like term positions and frequencies.
3. Lexical index
	1. A lexical index is a data structure that organizes text data alphabetically and by word patterns. Think of it like a dictionary or the index at the back of a book.

```plain
term1 -> [doc1: positions, doc3: positions, doc7: positions]
term2 -> [doc2: positions, doc5: positions, doc6: positions]
```

