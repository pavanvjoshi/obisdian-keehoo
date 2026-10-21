Think of it like creating a phone book for words. Just like a phone book helps you find someone's number by looking up their exact name, lexical indexing helps computers find documents by looking up exact words.

How it works:
1. **Breaks text into words** - Imagine you have a sentence like "I love Pizza and burgers". The system splits this into individual words; {"I", "Love", "Pizza", "and", "burgers"}
2. **Clean up the words** - The System removes unnecessary words like "and", "the", "is" and converts everything to lowercase. So "Pizza" becomes "pizza".
3. **Create word lists** - For each word, the system makes a list of where it appears. Like: "pizza" appears in Document 1, Document 2, and Document 4.