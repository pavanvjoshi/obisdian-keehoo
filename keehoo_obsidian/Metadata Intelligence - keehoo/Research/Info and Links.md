https://netflixtechblog.com/metacat-making-big-data-discoverable-and-meaningful-at-netflix-56fb36a53520 -> **Meta Cat Reading**

[https://claude.ai/chat/021d667b-8c67-4ef6-b7b7-0def42b8b6ba](https://claude.ai/share/12e3ee79-f6c0-4ee0-9c01-b1492232595a) ->  **Claude discussion.**

1. Meta cat 
	1. It is for big data stores(hive, s3, redshift, cassandra)
	2. It is open source we can test.
```
# Clone the repository
git clone git@github.com:Netflix/metacat.git
cd metacat

# Build it
./gradlew clean build

# The WAR file will be in metacat-war/build/libs
```

2. **Apache Tika** is the option for smaller data store which we can try.
3. **ExifTool** excellent for images videos, extracts EXIF, GPS, camera setting - https://exif.tools/
4. **MediaInfo** 