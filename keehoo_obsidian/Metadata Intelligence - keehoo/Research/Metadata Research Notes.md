## **MetaCat (Netflix)**

- Enterprise-scale **metadata catalog** for **big data platforms**
- Works with **Hive, S3, Redshift, Cassandra**
- Catalogs **databases, tables, schemas, partitions**
- Acts as a **metadata control plane**, not a file analyzer
- Open source; suitable for **POC and large data ecosystems**
- **Not for documents, images, or videos**

---

### **Apache Tika**

- Lightweight **file metadata + text extraction**
- Best for **documents (PDF, DOCX, HTML, emails)**
- Useful in **small to medium-scale content ingestion**
- Not a catalog; no dataset-level abstraction

---

### **ExifTool**

- Specialized **image/video metadata extractor**
- Extracts **EXIF, GPS, camera, timestamps**
- Excellent for **media forensics and enrichment**
- CLI-based; no cataloging

---

### **MediaInfo**

- Extracts **technical audio/video metadata**
- Codecs, bitrate, resolution, frame rate
- Ideal for **media pipelines and QA**
- No semantic or catalog layer

---

### **Bottom Line**

- **Structured data (tables, lakes)** → MetaCat
- **Documents** → Apache Tika
- **Images & videos (EXIF/GPS)** → ExifTool
- **Media technical details** → MediaInfo


https://netflixtechblog.com/metacat-making-big-data-discoverable-and-meaningful-at-netflix-56fb36a53520 -> **Meta Cat Reading**
**ExifTool** - https://exif.tools/
