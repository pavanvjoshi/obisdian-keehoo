```PYTHON
import json
import os
from datetime import datetime
from typing import Dict, List, Any, Optional
from langchain_openai import AzureChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from pymongo import MongoClient
from pymongo.database import Database
from pymongo.collection import Collection
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchIndex,
    SearchField,
    SearchFieldDataType,
    SimpleField,
    SearchableField,
    ComplexField
)
from azure.core.credentials import AzureKeyCredential
from dotenv import load_dotenv
import asyncio
import time

load_dotenv()

# Configuration - Externalized settings
class Config:
    # MongoDB Configuration
    MONGO_CONNECTION_STRING = os.getenv("MONGO_CONNECTION_STRING", "mongodb://localhost:27017/")
    DATABASE_NAME = os.getenv("DATABASE_NAME", "COC")
    TABLE_COLLECTION_NAME = os.getenv("TABLE_COLLECTION_NAME", "table_metadata")
    COLUMN_COLLECTION_NAME = os.getenv("COLUMN_COLLECTION_NAME", "column_metadata")
    
    # Azure AI Search Configuration
    SEARCH_ENDPOINT = os.getenv("AZURE_SEARCH_ENDPOINT")
    SEARCH_KEY = os.getenv("AZURE_SEARCH_ADMIN_KEY")
    TABLE_SEARCH_INDEX = os.getenv("TABLE_SEARCH_INDEX", "table_metadata_index")
    COLUMN_SEARCH_INDEX = os.getenv("COLUMN_SEARCH_INDEX", "column_metadata_index")
    
    # Azure OpenAI Configuration
    INFERENCE_MODEL = os.getenv("INFERENCE_MODEL", "gpt-4o-mini")
    OPENAI_API_VERSION = os.getenv("OPENAI_API_VERSION", "2023-12-01-preview")
    OPENAI_API_URL = os.getenv("OPENAI_API_URL")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

    # Azure OpenAI Embeddings Configuration
    EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-ada-002")
    EMBEDDING_DIMENSIONS = int(os.getenv("EMBEDDING_DIMENSIONS", "3072"))

class MongoDBMetadataProcessor:
    def __init__(self, config: Config = None):
        """
        Initialize the processor with externalized configuration
        
        Args:
            config: Configuration object containing all settings
        """
        self.config = config or Config()
        
        # Initialize MongoDB connection
        self.client = MongoClient(self.config.MONGO_CONNECTION_STRING)
        self.db: Database = self.client[self.config.DATABASE_NAME]
        self.table_collection: Collection = self.db[self.config.TABLE_COLLECTION_NAME]
        self.column_collection: Collection = self.db[self.config.COLUMN_COLLECTION_NAME]
        
        # Add these missing attributes
        self.search_endpoint = self.config.SEARCH_ENDPOINT
        self.search_key = self.config.SEARCH_KEY

        # Initialize Azure AI Search clients if credentials provided
        self.search_credential = None
        self.search_index_client = None
        self.table_search_client = None
        self.column_search_client = None
        
        if self.search_endpoint and self.search_key:
            self.search_credential = AzureKeyCredential(self.search_key)
            self.search_index_client = SearchIndexClient(
                endpoint=self.search_endpoint,
                credential=self.search_credential
            )
        
        # Initialize Azure OpenAI LLM
        self.llm = AzureChatOpenAI(
            azure_deployment=self.config.INFERENCE_MODEL,
            openai_api_version=self.config.OPENAI_API_VERSION,
            azure_endpoint=self.config.OPENAI_API_URL,
            api_key=self.config.OPENAI_API_KEY,
            temperature=0
        )

        # Initialize Azure OpenAI Embeddings client
        self.embedding_llm = AzureChatOpenAI(
            azure_deployment=self.config.EMBEDDING_MODEL,
            openai_api_version=self.config.OPENAI_API_VERSION,
            azure_endpoint=self.config.OPENAI_API_URL,
            api_key=self.config.OPENAI_API_KEY,
            temperature=0
        )
        
        print(f"Connected to MongoDB database: {self.config.DATABASE_NAME}")
        print(f"Table collection: {self.table_collection.count_documents({})}")
        print(f"Column collection: {self.column_collection.count_documents({})}")
        
        if self.config.SEARCH_ENDPOINT:
            print(f"Azure AI Search endpoint configured: {self.config.SEARCH_ENDPOINT}")
        
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Close MongoDB connection when exiting context"""
        self.client.close()
    
    def _get_table_documents_batch(self, skip: int, limit: int = 4) -> List[Dict[str, Any]]:
        """Retrieve a batch of table documents from MongoDB using pagination"""
        try:
            cursor = self.table_collection.find({}).skip(skip).limit(limit)
            tables = list(cursor)
            print(f"  Retrieved {len(tables)} tables from {skip} to {skip + len(tables)}")
            return tables
        except Exception as e:
            print(f"Error retrieving batch of table documents: {str(e)}")
            return []
    
    def _get_total_table_count(self) -> int:
        """Get total number of table documents"""
        try:
            return self.table_collection.count_documents({})
        except Exception as e:
            print(f"Error counting table documents: {str(e)}")
            return 0
        
        
    def _get_all_table_documents(self) -> List[Dict[str, Any]]:
        """Retrieve all documents from table_metadata collection"""
        try:
            cursor = self.table_collection.find({})
            tables = list(cursor)
            print(f"Retrieved {len(tables)} table documents from MongoDB")
            return tables
        except Exception as e:
            print(f"Error retrieving table documents: {str(e)}")
            return []
    
    def _get_all_column_documents(self) -> List[Dict[str, Any]]:
        """Retrieve all documents from column_metadata collection"""
        try:
            cursor = self.column_collection.find({})
            columns = list(cursor)
            print(f"Retrieved {len(columns)} column documents from MongoDB")
            return columns
        except Exception as e:
            print(f"Error retrieving column documents: {str(e)}")
            return []
    
    def _get_columns_for_table(self, table_id: str) -> List[Dict[str, Any]]:
        """Retrieve all column documents for a specific table ID"""
        try:
            cursor = self.column_collection.find({"data.parent_id": table_id})
            columns = list(cursor)
            print(f"  Retrieved {len(columns)} column documents for table ID: {table_id}")
            return columns
        except Exception as e:
            print(f"  Error retrieving column documents for table {table_id}: {str(e)}")
            return []
    
    def _create_system_prompt(self) -> str:
        """Create system prompt for LLM processing"""
        return """You are a data analyst expert specializing in creating comprehensive metadata for database tables and columns.

Your task is to analyze table and column information and generate detailed metadata for the specified fields only.

**CRITICAL REQUIREMENTS:**
1. YOU MUST ALWAYS provide a complete, valid JSON response
2. YOU MUST NEVER provide incomplete responses or explanations  
3. YOU MUST respond with ONLY the JSON structure - no additional text, explanations, or markdown formatting
4. Generate metadata for ONLY the requested fields: description, embedding_input, tags, and foreign_keys

**RESPONSE FORMAT:**
Respond with ONLY a valid JSON object in exactly this structure (no markdown, no code blocks, no explanations):

{
  "table_metadata": {
    "description": "<concise_description_for_UI>",
    "embedding_input": "<detailed_description_for_embedding>", 
    "tags": ["<tag1>", "<tag2>", "<tag3>"],
    "foreign_keys": ["<column_name1>", "<column_name2>"]
  },
  "columns_metadata": [
    {
      "column_id": "<column_id>",
      "description": "<concise_description_for_UI>",
      "embedding_input": "<detailed_description_for_embedding>",
      "tags": ["<tag1>", "<tag2>", "<tag3>"]
    }
  ]
}

**FIELD GUIDELINES:**

**For Table:**
- **description**: Concise description (1 sentence) suitable for UI rendering
- **embedding_input**: For embedding purposes, the table-level description should be comprehensive, covering the business description, technical structure, and intended purpose of the table. It should explain what the table represents, how it supports key business processes, and the nature of the data it stores. The description must also detail the table's structure, such as how it is organized, key identifiers, and any important constraints. Including synonyms or alternate names helps improve semantic understanding during embedding.
- **tags**: Provide 1-3 relevant tags for searchability
- **foreign_keys**: CRITICAL - Infer which columns are likely to serve as foreign keys by understanding their semantic meaning and relational intent. Focus on identifying columns that are likely referencing other tables, typically serving as links between related entities. Consider the following signals (not strict rules):
    * Column names that suggest relationships (e.g., include terms like "id", "key", or entity names)
    * Data types commonly used for identifiers (e.g., integer, UUID, string)
    * Naming patterns or semantic clues that imply linkage to another table
    * Columns that are contextually significant for joining records across entities
    * Return an array of column names (not IDs) that are most likely acting as foreign keys based on their meaning and role in relational structure.

**For Columns:**
- **column_id**: Use the exact column ID from input
- **description**: Concise description (1 sentence) suitable for UI rendering  
- **embedding_input**: For embedding purposes, each column must have a detailed and enriched description that captures its data type, applicable constraints (e.g., primary key, nullable, unique), and its functional purpose within the table. The description should clearly explain what the column represents, how it is used in business or technical workflows, and why it is important. Additionally, include any relevant synonyms or alternate labels to enhance semantic understanding and support more effective retrieval during search.
- **tags**: Provide 1-3 relevant tags for searchability

**REMEMBER:** Respond with ONLY the JSON object. No explanations, no markdown formatting, no code blocks."""
    
    def _create_user_prompt(self, table_doc: Dict[str, Any], column_docs: List[Dict[str, Any]]) -> str:
        """Create user prompt with table and column information"""
        
        # Extract table information
        table_data = table_doc.get('data', {})
        table_info = f"""**Table Information:**
- Table ID: {table_data.get('id', 'N/A')}
- Table Label: {table_data.get('label', 'N/A')}
- Table Type: {table_data.get('type', 'N/A')}
- Parent Type: {table_data.get('parent_type', 'N/A')}
- Parent ID: {table_data.get('parent_id', 'N/A')}
- Parent Name: {table_data.get('parent_name', 'N/A')}
- Primary Keys: {table_doc.get('primary_keys', [])}
- Foreign Keys (if known): {table_doc.get('foreign_keys', [])}
- Referencing Tables: {table_doc.get('referencing_tables', [])}"""
        
        # Extract column information
        columns_info = "**Columns Information:**\n"
        for i, col_doc in enumerate(column_docs, 1):
            col_data = col_doc.get('data', {})

            columns_info += f"""
Column {i}:
- Column ID: {col_data.get('id', 'N/A')}
- Column Label: {col_data.get('label', 'N/A')}
- Data Type: {col_data.get('data_type', 'N/A')}
- Nullable: {col_data.get('nullable', 'N/A')}
- Sample Values: {col_doc.get('sample_values', [])}
- Foreign Key Indicators: <LLM to analyze based on name, type, and sample values> """

        return f"""Analyze the following table and column data to generate comprehensive metadata:

{table_info}

{columns_info}

**SPECIAL FOCUS ON FOREIGN KEY DETECTION:**
Look for columns that could be foreign keys by analyzing:
1. Column names ending with '_id', '_key', or containing 'id' 
2. Data types suitable for keys (int, bigint, uuid, varchar with key patterns)
3. Column names that suggest references to other entities
4. Patterns indicating relationships (customer_id, user_id, order_id, etc.)

**Requirements:**
- Generate meaningful descriptions and embedding inputs based on the table and column information
- Create relevant tags for searchability
- CRITICALLY IMPORTANT: Analyze and infer probable foreign key columns for the table
- Use the table structure and column details to infer business context
- Include all column IDs in the response for proper mapping

Respond with ONLY the JSON object - no explanations, no markdown, no code blocks."""
    
    async def _query_llm(self, system_prompt: str, user_prompt: str) -> Optional[str]:
        """Asynchronously query the LLM with the given prompts"""
        try:
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt)
            ]
            
            response = await self.llm.ainvoke(messages)
            return response.content
        except Exception as e:
            print(f"    Error querying LLM: {str(e)}")
            return None
    
    def _parse_llm_response(self, response: str) -> Optional[Dict[str, Any]]:
        """Parse LLM response to extract the metadata JSON"""
        try:
            # Clean the response - remove any markdown formatting
            clean_response = response.strip()
            
            # Remove code block markers if present
            if clean_response.startswith('```'):
                lines = clean_response.split('\n')
                if lines[0].strip() in ['```json', '```']:
                    lines = lines[1:]
                if lines and lines[-1].strip() == '```':
                    lines = lines[:-1]
                clean_response = '\n'.join(lines)
            
            # Try to find JSON object boundaries
            start_idx = clean_response.find('{')
            if start_idx == -1:
                print("    No JSON object found in response")
                return None
            
            # Find the matching closing brace
            brace_count = 0
            end_idx = -1
            for i in range(start_idx, len(clean_response)):
                if clean_response[i] == '{':
                    brace_count += 1
                elif clean_response[i] == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        end_idx = i
                        break
            
            if end_idx == -1:
                print("    Could not find matching closing brace")
                return None
            
            json_str = clean_response[start_idx:end_idx+1]
            
            # Parse JSON string
            metadata_json = json.loads(json_str)
            
            return metadata_json
            
        except json.JSONDecodeError as e:
            print(f"    JSON decode error: {str(e)}")
            return None
        except Exception as e:
            print(f"    Error parsing LLM response: {str(e)}")
            return None
    
    def _generate_embedding(self, text: str) -> Optional[List[float]]:
        """Generate embedding for given text using Azure OpenAI"""
        try:
            if not text or not text.strip():
                return None
            
            # Use Azure OpenAI embeddings API
            from openai import AzureOpenAI
            
            client = AzureOpenAI(
                api_key=self.config.OPENAI_API_KEY,
                api_version=self.config.OPENAI_API_VERSION,
                azure_endpoint=self.config.OPENAI_API_URL
            )
            
            response = client.embeddings.create(
                input=text.strip(),
                model=self.config.EMBEDDING_MODEL
            )
            
            embedding = response.data[0].embedding
            return embedding
            
        except Exception as e:
            print(f"    Error generating embedding: {str(e)}")
            return None



    def _update_table_document(self, table_id: str, table_metadata: Dict[str, Any]) -> bool:
        """Update table document in MongoDB with generated metadata and embedding"""
        try:
            # Generate embedding for embedding_input
            embedding_input = table_metadata.get("embedding_input", "")
            embedding_vector = None
            
            if embedding_input and embedding_input.strip():
                print(f"      Generating embedding for table {table_id}...")
                embedding_vector = self._generate_embedding(embedding_input)
                if embedding_vector:
                    print(f"       Generated embedding ({len(embedding_vector)} dimensions)")
                else:
                    print(f"       Failed to generate embedding")
            
            update_doc = {
                "$set": {
                    "data.description": table_metadata.get("description", ""),
                    "embedding_input": embedding_input,
                    "embedding_vector": embedding_vector,  # Add embedding vector
                    "tags": table_metadata.get("tags", []),
                    "foreign_keys": table_metadata.get("foreign_keys", []),
                    "last_updated_by": "user_ai",
                    "updated_at": datetime.utcnow().isoformat() + "Z"
                }
            }
            
            result = self.table_collection.update_one(
                {"data.id": table_id},
                update_doc
            )
            
            if result.modified_count > 0:
                print(f"     Updated table document for ID: {table_id}")
                # Print foreign keys if found
                foreign_keys = table_metadata.get("foreign_keys", [])
                if foreign_keys:
                    print(f"      Inferred foreign keys: {foreign_keys}")
                return True
            else:
                print(f"     No table document updated for ID: {table_id}")
                return False
                
        except Exception as e:
            print(f"     Error updating table document {table_id}: {str(e)}")
            return False

    def _update_column_documents(self, columns_metadata: List[Dict[str, Any]]) -> int:
        """Update column documents in MongoDB with generated metadata and embeddings"""
        updated_count = 0
        
        for col_metadata in columns_metadata:
            try:
                column_id = col_metadata.get("column_id")
                if not column_id:
                    print(f"       No column_id found in metadata")
                    continue
                
                # Generate embedding for embedding_input
                embedding_input = col_metadata.get("embedding_input", "")
                embedding_vector = None
                
                if embedding_input and embedding_input.strip():
                    print(f"        Generating embedding for column {column_id}...")
                    embedding_vector = self._generate_embedding(embedding_input)
                    if embedding_vector:
                        print(f"         Generated embedding ({len(embedding_vector)} dimensions)")
                    else:
                        print(f"         Failed to generate embedding")
                
                update_doc = {
                    "$set": {
                        "data.description": col_metadata.get("description", ""),
                        "embedding_input": embedding_input,
                        "embedding_vector": embedding_vector,  # Add embedding vector
                        "tags": col_metadata.get("tags", []),
                        "last_updated_by": "user_ai",
                        "updated_at": datetime.utcnow().isoformat() + "Z"
                    }
                }
                
                result = self.column_collection.update_one(
                    {"data.id": column_id},
                    update_doc
                )
                
                if result.modified_count > 0:
                    print(f"       Updated column document for ID: {column_id}")
                    updated_count += 1
                else:
                    print(f"       No column document updated for ID: {column_id}")
                    
            except Exception as e:
                print(f"       Error updating column document {column_id}: {str(e)}")
        
        return updated_count
        
    def _create_table_search_index(self) -> bool:
        """Create Azure AI Search index for tables with vector field"""
        try:
            fields = [
                SimpleField(name="id", type=SearchFieldDataType.String, key=True),
                SearchableField(name="label", type=SearchFieldDataType.String),
                SearchableField(name="type", type=SearchFieldDataType.String),
                SearchableField(name="parent_type", type=SearchFieldDataType.String),
                SimpleField(name="parent_id", type=SearchFieldDataType.String),
                SearchableField(name="parent_name", type=SearchFieldDataType.String),
                SearchableField(name="description", type=SearchFieldDataType.String),
                SearchableField(name="embedding_input", type=SearchFieldDataType.String),
                # Add vector field for embeddings
                SearchField(
                    name="embedding_vector",
                    type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
                    searchable=True,
                    vector_search_dimensions=self.config.EMBEDDING_DIMENSIONS,
                    vector_search_profile_name="default"
                ),
                SearchableField(name="tags", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
                SimpleField(name="primary_keys", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
                SimpleField(name="foreign_keys", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
                SimpleField(name="referencing_tables", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
                SimpleField(name="created_by", type=SearchFieldDataType.String),
                SimpleField(name="created_at", type=SearchFieldDataType.DateTimeOffset),
                SimpleField(name="last_updated_by", type=SearchFieldDataType.String),
                SimpleField(name="updated_at", type=SearchFieldDataType.DateTimeOffset),
                ComplexField(name="human_feedback", fields=[
                    SimpleField(name="user", type=SearchFieldDataType.String),
                    SearchableField(name="comment", type=SearchFieldDataType.String),
                    SimpleField(name="timestamp", type=SearchFieldDataType.String)
                ])
            ]
            
            # Configure vector search
            from azure.search.documents.indexes.models import (
                VectorSearch, HnswAlgorithmConfiguration, VectorSearchProfile, SemanticConfiguration
            )
            
            vector_search = VectorSearch(
                algorithms=[
                    HnswAlgorithmConfiguration(
                        name="default-hnsw",
                        parameters={
                            "m": 4,
                            "efConstruction": 400,
                            "efSearch": 500,
                            "metric": "cosine"
                        }
                    )
                ],
                profiles=[
                    VectorSearchProfile(
                        name="default",
                        algorithm_configuration_name="default-hnsw"
                    )
                ]
            )
            
            index = SearchIndex(
                name=self.config.TABLE_SEARCH_INDEX, 
                fields=fields,
                vector_search=vector_search
            )
        
            # Create or update the index
            result = self.search_index_client.create_or_update_index(index)
            print(f" Created/Updated table search index with vector support: {self.config.TABLE_SEARCH_INDEX}")
            
            # Initialize search client for tables
            self.table_search_client = SearchClient(
                endpoint=self.config.SEARCH_ENDPOINT,
                index_name=self.config.TABLE_SEARCH_INDEX,
                credential=self.search_credential
            )
            
            return True
            
        except Exception as e:
            print(f" Error creating table search index: {str(e)}")
            return False

    def _create_column_search_index(self) -> bool:
        """Create Azure AI Search index for columns with vector field"""
        try:
            fields = [
                SimpleField(name="id", type=SearchFieldDataType.String, key=True),
                SearchableField(name="label", type=SearchFieldDataType.String),
                SearchableField(name="data_type", type=SearchFieldDataType.String),
                SimpleField(name="nullable", type=SearchFieldDataType.Boolean),
                SimpleField(name="parent_id", type=SearchFieldDataType.String),
                SearchableField(name="parent_name", type=SearchFieldDataType.String),
                SearchableField(name="parent_type", type=SearchFieldDataType.String),
                SearchableField(name="description", type=SearchFieldDataType.String),
                SearchableField(name="embedding_input", type=SearchFieldDataType.String),
                # Add vector field for embeddings
                SearchField(
                    name="embedding_vector",
                    type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
                    searchable=True,
                    vector_search_dimensions=self.config.EMBEDDING_DIMENSIONS,
                    vector_search_profile_name="default"
                ),
                SearchableField(name="tags", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
                SimpleField(name="sample_values", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
                SimpleField(name="created_by", type=SearchFieldDataType.String),
                SimpleField(name="created_at", type=SearchFieldDataType.DateTimeOffset),
                SimpleField(name="last_updated_by", type=SearchFieldDataType.String),
                SimpleField(name="updated_at", type=SearchFieldDataType.DateTimeOffset),
                ComplexField(name="human_feedback", fields=[
                    SimpleField(name="user", type=SearchFieldDataType.String),
                    SearchableField(name="comment", type=SearchFieldDataType.String),
                    SimpleField(name="timestamp", type=SearchFieldDataType.String)
                ])
            ]
            
            # Configure vector search (same as tables)
            from azure.search.documents.indexes.models import (
                VectorSearch, HnswAlgorithmConfiguration, VectorSearchProfile
            )
            
            vector_search = VectorSearch(
                algorithms=[
                    HnswAlgorithmConfiguration(
                        name="default-hnsw",
                        parameters={
                            "m": 4,
                            "efConstruction": 400,
                            "efSearch": 500,
                            "metric": "cosine"
                        }
                    )
                ],
                profiles=[
                    VectorSearchProfile(
                        name="default",
                        algorithm_configuration_name="default-hnsw"
                    )
                ]
            )
            
            index = SearchIndex(
                name=self.config.COLUMN_SEARCH_INDEX, 
                fields=fields,
                vector_search=vector_search
            )
        
            # Create or update the index
            result = self.search_index_client.create_or_update_index(index)
            print(f" Created/Updated column search index with vector support: {self.config.COLUMN_SEARCH_INDEX}")
            
            # Initialize search client for columns
            self.column_search_client = SearchClient(
                endpoint=self.config.SEARCH_ENDPOINT,
                index_name=self.config.COLUMN_SEARCH_INDEX,
                credential=self.search_credential
            )
            
            return True
            
        except Exception as e:
            print(f" Error creating column search index: {str(e)}")
            return False
    
    def _prepare_table_document_for_search(self, table_doc: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare table document for Azure AI Search indexing"""
        table_data = table_doc.get('data', {})
        
        # Check if embedding_input is empty - skip if so
        embedding_input = str(table_doc.get('embedding_input', '')).strip()
        if not embedding_input:
            return None  # Signal to skip this document
        
        def safe_datetime(value):
            """Safely convert datetime string to proper format"""
            if isinstance(value, str) and value.strip():
                try:
                    # Ensure the datetime string ends with Z for UTC
                    if not value.endswith('Z'):
                        return value + 'Z' if 'T' in value else value
                    return value
                except:
                    return datetime.utcnow().isoformat() + "Z"
            return datetime.utcnow().isoformat() + "Z"
        
        def clean_human_feedback(feedback_list):
            """Clean human feedback array to remove empty objects"""
            if not isinstance(feedback_list, list):
                return []
            
            cleaned_feedback = []
            for feedback in feedback_list:
                if isinstance(feedback, dict):
                    user = str(feedback.get('user', '')).strip()
                    comment = str(feedback.get('comment', '')).strip()
                    timestamp = str(feedback.get('timestamp', '')).strip()
                    
                    cleaned_feedback.append({
                        "user": user,
                        "comment": comment,
                        "timestamp": timestamp
                    })
            
            return cleaned_feedback
        
        def safe_list(value):
            """Safely convert value to list"""
            if isinstance(value, list):
                return [str(item) if item is not None else "" for item in value]
            return []
        
        def safe_string(value):
            """Safely convert value to string"""
            return str(value) if value is not None else ""
        
        # Prepare the complete document - DO NOT include embedding_vector from MongoDB
        search_doc = {
            "id": safe_string(table_data.get('id', '')),
            "label": safe_string(table_data.get('label', '')),
            "type": safe_string(table_data.get('type', '')),
            "parent_type": safe_string(table_data.get('parent_type', '')),
            "parent_id": safe_string(table_data.get('parent_id', '')),
            "parent_name": safe_string(table_data.get('parent_name', '')),
            "description": safe_string(table_data.get('description', '')),
            "embedding_input": embedding_input,  # This will be embedded by Azure AI Search
            # Note: embedding_vector will be auto-generated by Azure AI Search from embedding_input
            "tags": safe_list(table_doc.get('tags', [])),
            "primary_keys": safe_list(table_doc.get('primary_keys', [])),
            "foreign_keys": safe_list(table_doc.get('foreign_keys', [])),
            "referencing_tables": safe_list(table_doc.get('referencing_tables', [])),
            "created_by": safe_string(table_doc.get('created_by', '')),
            "created_at": safe_datetime(table_doc.get('created_at')),
            "last_updated_by": safe_string(table_doc.get('last_updated_by', '')),
            "updated_at": safe_datetime(table_doc.get('updated_at')),
            "human_feedback": clean_human_feedback(table_doc.get('human_feedback', []))
        }
        
        return search_doc


    def _prepare_column_document_for_search(self, column_doc: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare column document for Azure AI Search indexing"""
        column_data = column_doc.get('data', {})
        
        # Check if embedding_input is empty - skip if so
        embedding_input = str(column_doc.get('embedding_input', '')).strip()
        if not embedding_input:
            return None  # Signal to skip this document
        
        def safe_datetime(value):
            """Safely convert datetime string to proper format"""
            if isinstance(value, str) and value.strip():
                try:
                    # Ensure the datetime string ends with Z for UTC
                    if not value.endswith('Z'):
                        return value + 'Z' if 'T' in value else value
                    return value
                except:
                    return datetime.utcnow().isoformat() + "Z"
            return datetime.utcnow().isoformat() + "Z"
        
        def clean_human_feedback(feedback_list):
            """Clean human feedback array to remove empty objects"""
            if not isinstance(feedback_list, list):
                return []
            
            cleaned_feedback = []
            for feedback in feedback_list:
                if isinstance(feedback, dict):
                    user = str(feedback.get('user', '')).strip()
                    comment = str(feedback.get('comment', '')).strip()
                    timestamp = str(feedback.get('timestamp', '')).strip()
                    
                    cleaned_feedback.append({
                        "user": user,
                        "comment": comment,
                        "timestamp": timestamp
                    })
            
            return cleaned_feedback
        
        def safe_sample_values(values):
            """Safely convert sample values to strings"""
            if not isinstance(values, list):
                return []
            
            safe_values = []
            for value in values:
                if value is not None:
                    safe_values.append(str(value))
                else:
                    safe_values.append("")
            
            return safe_values
        
        def safe_list(value):
            """Safely convert value to list"""
            if isinstance(value, list):
                return [str(item) if item is not None else "" for item in value]
            return []
        
        def safe_string(value):
            """Safely convert value to string"""
            return str(value) if value is not None else ""
        
        def safe_boolean(value):
            """Safely convert value to boolean"""
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                return value.lower() in ('true', '1', 'yes')
            return bool(value) if value is not None else False
        
        # Prepare the complete document - DO NOT include embedding_vector from MongoDB
        search_doc = {
            "id": safe_string(column_data.get('id', '')),
            "label": safe_string(column_data.get('label', '')),
            "data_type": safe_string(column_data.get('data_type', '')),
            "nullable": safe_boolean(column_data.get('nullable', False)),
            "parent_id": safe_string(column_data.get('parent_id', '')),
            "parent_name": safe_string(column_data.get('parent_name', '')),
            "parent_type": safe_string(column_data.get('parent_type', '')),
            "description": safe_string(column_data.get('description', '')),
            "embedding_input": embedding_input,  # This will be embedded by Azure AI Search
            # Note: embedding_vector will be auto-generated by Azure AI Search from embedding_input
            "tags": safe_list(column_doc.get('tags', [])),
            "sample_values": safe_sample_values(column_doc.get('sample_values', [])),
            "created_by": safe_string(column_doc.get('created_by', '')),
            "created_at": safe_datetime(column_doc.get('created_at')),
            "last_updated_by": safe_string(column_doc.get('last_updated_by', '')),
            "updated_at": safe_datetime(column_doc.get('updated_at')),
            "human_feedback": clean_human_feedback(column_doc.get('human_feedback', []))
        }
        
        return search_doc


    def _index_table_documents(self) -> int:
        """Index all table documents to Azure AI Search"""
        if not self.table_search_client:
            print(" Table search client not initialized")
            return 0
        
        print("\nStarting table documents indexing to Azure AI Search...")
        
        # Get all updated table documents from MongoDB
        table_documents = self._get_all_table_documents()
        
        if not table_documents:
            print("No table documents found for indexing")
            return 0
        
        indexed_count = 0
        failed_count = 0
        skipped_count = 0  # Track skipped documents
        batch_documents = []
        batch_size = 50
        
        for i, table_doc in enumerate(table_documents):
            try:
                # Prepare document for search indexing
                search_doc = self._prepare_table_document_for_search(table_doc)
                
                # Skip documents with empty embedding_input
                if search_doc is None:
                    table_id = table_doc.get('data', {}).get('id', f'table_{i+1}')
                    print(f"   Skipping table {table_id}: Empty embedding_input")
                    skipped_count += 1
                    continue
                
                # Skip documents without valid ID
                if not search_doc.get("id"):
                    print(f"   Skipping table document {i+1}: Missing ID")
                    failed_count += 1
                    continue
                
                # Add merge or upload action
                search_doc["@search.action"] = "mergeOrUpload"
                batch_documents.append(search_doc)
                
                # Process in batches
                if len(batch_documents) >= batch_size:
                    try:
                        result = self.table_search_client.upload_documents(documents=batch_documents)
                        batch_indexed = len([r for r in result if r.succeeded])
                        batch_failed = len([r for r in result if not r.succeeded])
                        
                        indexed_count += batch_indexed
                        failed_count += batch_failed
                        
                        if batch_failed > 0:
                            print(f"   Batch had {batch_failed} failures")
                            for r in result:
                                if not r.succeeded:
                                    print(f"     Failed: {r.key} - {r.error_message}")
                        
                        batch_documents = []
                        
                    except Exception as batch_e:
                        print(f"   Error processing batch: {str(batch_e)}")
                        failed_count += len(batch_documents)
                        batch_documents = []
                        
            except Exception as e:
                table_id = table_doc.get('data', {}).get('id', f'table_{i+1}')
                print(f"   Error preparing table document {table_id} for indexing: {str(e)}")
                failed_count += 1
        
        # Process remaining documents
        if batch_documents:
            try:
                result = self.table_search_client.upload_documents(documents=batch_documents)
                batch_indexed = len([r for r in result if r.succeeded])
                batch_failed = len([r for r in result if not r.succeeded])
                
                indexed_count += batch_indexed
                failed_count += batch_failed
                
                if batch_failed > 0:
                    print(f"   Final batch had {batch_failed} failures")
                    for r in result:
                        if not r.succeeded:
                            print(f"     Failed: {r.key} - {r.error_message}")
                            
            except Exception as e:
                print(f"   Error indexing final batch of table documents: {str(e)}")
                failed_count += len(batch_documents)
        
        print(f"Indexed {indexed_count}/{len(table_documents)} table documents ({failed_count} failed, {skipped_count} skipped)")
        return indexed_count


    def _index_column_documents(self) -> int:
        """Index all column documents to Azure AI Search"""
        if not self.column_search_client:
            print("Column search client not initialized")
            return 0
        
        print("\nStarting column documents indexing to Azure AI Search...")
        
        # Get all updated column documents from MongoDB
        column_documents = self._get_all_column_documents()
        
        if not column_documents:
            print("No column documents found for indexing")
            return 0
        
        indexed_count = 0
        failed_count = 0
        skipped_count = 0  # Track skipped documents
        batch_documents = []
        batch_size = 50
        
        for i, column_doc in enumerate(column_documents):
            try:
                # Prepare document for search indexing
                search_doc = self._prepare_column_document_for_search(column_doc)
                
                # Skip documents with empty embedding_input
                if search_doc is None:
                    column_id = column_doc.get('data', {}).get('id', f'column_{i+1}')
                    print(f"   Skipping column {column_id}: Empty embedding_input")
                    skipped_count += 1
                    continue
                
                # Skip documents without valid ID
                if not search_doc.get("id"):
                    print(f"   Skipping column document {i+1}: Missing ID")
                    failed_count += 1
                    continue
                
                # Add merge or upload action
                search_doc["@search.action"] = "mergeOrUpload"
                batch_documents.append(search_doc)
                
                # Process in batches
                if len(batch_documents) >= batch_size:
                    try:
                        result = self.column_search_client.upload_documents(documents=batch_documents)
                        batch_indexed = len([r for r in result if r.succeeded])
                        batch_failed = len([r for r in result if not r.succeeded])
                        
                        indexed_count += batch_indexed
                        failed_count += batch_failed
                        
                        if batch_failed > 0:
                            print(f"   Batch had {batch_failed} failures")
                            for r in result:
                                if not r.succeeded:
                                    print(f"     Failed: {r.key} - {r.error_message}")
                        
                        batch_documents = []
                        
                    except Exception as batch_e:
                        print(f"   Error processing batch: {str(batch_e)}")
                        failed_count += len(batch_documents)
                        batch_documents = []
                        
            except Exception as e:
                column_id = column_doc.get('data', {}).get('id', f'column_{i+1}')
                print(f"   Error preparing column document {column_id} for indexing: {str(e)}")
                failed_count += 1
        
        # Process remaining documents
        if batch_documents:
            try:
                result = self.column_search_client.upload_documents(documents=batch_documents)
                batch_indexed = len([r for r in result if r.succeeded])
                batch_failed = len([r for r in result if not r.succeeded])
                
                indexed_count += batch_indexed
                failed_count += batch_failed
                
                if batch_failed > 0:
                    print(f"   Final batch had {batch_failed} failures")
                    for r in result:
                        if not r.succeeded:
                            print(f"     Failed: {r.key} - {r.error_message}")
                            
            except Exception as e:
                print(f"   Error indexing final batch of column documents: {str(e)}")
                failed_count += len(batch_documents)
        
        print(f" Indexed {indexed_count}/{len(column_documents)} column documents ({failed_count} failed, {skipped_count} skipped)")
        return indexed_count
    
    async def process_metadata_generation(self, batch_size: int = 4):
        """Process metadata generation for batch of tables  (Task 1)"""
        print("="*60)
        print("TASK 1: Starting metadata generation...")
        print("="*60)
        
        total_tables = self._get_total_table_count()
        print(f"Total tables to process: {total_tables}")
        total_start_time = time.perf_counter()
        
        processed_tables = 0
        total_columns_updated = 0
        skip = 0
        
        while skip < total_tables:
            batch_start_time = time.perf_counter()
            table_batch = self._get_table_documents_batch(skip, batch_size)

            if not table_batch:
                break

            print(f"\nBatch {skip + 1} to {skip + len(table_batch)}")

            # Run processing for this batch in parallel
            tasks = [
                self._process_table(skip + idx + 1, table_doc)
                for idx, table_doc in enumerate(table_batch)
            ]
            results = await asyncio.gather(*tasks)
            
            batch_end_time = time.perf_counter()  # 🔁 End batch timer
            print(f"🕒 Time taken for batch: {batch_end_time - batch_start_time:.2f} seconds")

            # Aggregate results
            processed_tables += sum(r["tables"] for r in results)
            total_columns_updated += sum(r["columns"] for r in results)

            skip += batch_size
            
            total_end_time = time.perf_counter()
        
        print(f"\n{'='*50}")
        print(f"TASK 1 COMPLETE: Metadata generation finished!")
        print(f"Tables processed: {processed_tables}/{total_tables}")
        print(f"Columns updated: {total_columns_updated}")
        print(f"🕒 Total time taken: {total_end_time - total_start_time:.2f} seconds")
        print(f"{'='*50}")
        
        return processed_tables > 0 or total_columns_updated > 0
    
    
    async def _process_table(self, index: int, table_doc: Dict[str, Any]) -> Dict[str, int]:
        """Process metadata generation for a single table (async LLM call)"""
        try:
            table_id = table_doc.get("data", {}).get("id")
            print(f"  → [{index}] Processing table: {table_id}")

            # 1. Get columns for this table
            column_docs = self._get_columns_for_table(table_id)

            # 2. Create prompts
            system_prompt = self._create_system_prompt()
            user_prompt = self._create_user_prompt(table_doc, column_docs)

            # 3. Query LLM
            llm_response = await self._query_llm(system_prompt, user_prompt)
            if not llm_response:
                print(f"    ✗ No LLM response for table {table_id}")
                return {"tables": 0, "columns": 0}

            # 4. Parse LLM response
            parsed = self._parse_llm_response(llm_response)
            if not parsed:
                print(f"    ✗ Failed to parse LLM response for table {table_id}")
                return {"tables": 0, "columns": 0}

            table_metadata = parsed.get("table_metadata", {})
            columns_metadata = parsed.get("columns_metadata", [])

            # 5. Update MongoDB documents
            updated_table = self._update_table_document(table_id, table_metadata)
            updated_columns = self._update_column_documents(columns_metadata)

            return {
                "tables": 1 if updated_table else 0,
                "columns": updated_columns
            }

        except Exception as e:
            print(f"    ✗ Error processing table {table_doc.get('data', {}).get('id')}: {str(e)}")
            return {"tables": 0, "columns": 0}
    
    def process_azure_search_indexing(self):
        """Process Azure AI Search indexing for all documents (Task 2)"""
        if not self.search_endpoint or not self.search_key:
            print(" Azure AI Search credentials not provided. Skipping indexing.")
            return False
        
        print("\n" + "="*60)
        print("TASK 2: Starting Azure AI Search indexing...")
        print("="*60)
        
        # Create search indexes
        print("Creating Azure AI Search indexes...")
        table_index_created = self._create_table_search_index()
        column_index_created = self._create_column_search_index()
        
        if not table_index_created or not column_index_created:
            print(" Failed to create search indexes")
            return False
        
        # Index table documents
        indexed_tables = self._index_table_documents()
        
        # Index column documents
        indexed_columns = self._index_column_documents()
        
        print(f"\n{'='*50}")
        print(f"TASK 2 COMPLETE: Azure AI Search indexing finished!")
        print(f"Tables indexed: {indexed_tables}")
        print(f"Columns indexed: {indexed_columns}")
        print(f"{'='*50}")
        
        return indexed_tables > 0 or indexed_columns > 0
    
    def process_complete_pipeline(self):
        """Execute the complete pipeline: Task 1 (Metadata) -> Task 2 (Indexing)"""
        print("Starting complete metadata processing and indexing pipeline...")
        print("="*80)
        
        # Task 1: Generate metadata using LLM and update MongoDB
        metadata_success = self.process_metadata_generation()
        
        if not metadata_success:
            print(" Task 1 failed. Stopping pipeline.")
            return
        
        # Task 2: Index documents to Azure AI Search
        indexing_success = self.process_azure_search_indexing()
        
        if not indexing_success:
            print(" Task 2 failed, but Task 1 completed successfully.")
            return
        
        print("\n" + "="*80)
        print("🎉 COMPLETE PIPELINE FINISHED SUCCESSFULLY!")
        print(" Task 1: Metadata generation and MongoDB updates - COMPLETED")
        print(" Task 2: Azure AI Search indexing - COMPLETED")
        print("="*80)


    def _calculate_cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        try:
            import numpy as np
            
            if not vec1 or not vec2 or len(vec1) != len(vec2):
                return 0.0
                
            vec1 = np.array(vec1)
            vec2 = np.array(vec2)
            
            # Calculate cosine similarity
            dot_product = np.dot(vec1, vec2)
            norm1 = np.linalg.norm(vec1)
            norm2 = np.linalg.norm(vec2)
            
            if norm1 == 0 or norm2 == 0:
                return 0.0
                
            return float(dot_product / (norm1 * norm2))
            
        except Exception as e:
            print(f"    Error calculating cosine similarity: {str(e)}")
            return 0.0

    def _find_similar_tables(self, target_table_doc: Dict[str, Any], all_tables: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:
        """Find top K most similar tables using embedding vectors"""
        target_embedding = target_table_doc.get('embedding_vector')
        target_id = target_table_doc.get('data', {}).get('id')
        
        if not target_embedding or not target_id:
            return []
        
        similarities = []
        
        for table_doc in all_tables:
            table_data = table_doc.get('data', {})
            table_id = table_data.get('id')
            table_embedding = table_doc.get('embedding_vector')
            
            # Skip same table
            if table_id == target_id:
                continue
                
            if not table_embedding:
                continue
                
            similarity = self._calculate_cosine_similarity(target_embedding, table_embedding)
            if similarity > 0:
                similarities.append({
                    'table_doc': table_doc,
                    'similarity': similarity,
                    'table_id': table_id,
                    'table_label': table_data.get('label', 'Unknown')
                })
        
        # Sort by similarity descending and return top K
        similarities.sort(key=lambda x: x['similarity'], reverse=True)
        return [item['table_doc'] for item in similarities[:top_k]]

    def _find_similar_columns(self, target_table_doc: Dict[str, Any], all_columns: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:
        """Find top K most similar columns using embedding vectors"""
        target_embedding = target_table_doc.get('embedding_vector')
        target_table_id = target_table_doc.get('data', {}).get('id')
        
        if not target_embedding or not target_table_id:
            return []
        
        similarities = []
        
        for column_doc in all_columns:
            column_data = column_doc.get('data', {})
            column_id = column_data.get('id')
            column_embedding = column_doc.get('embedding_vector')
            parent_id = column_data.get('parent_id')
            
            # Skip columns from same table
            if parent_id == target_table_id:
                continue
                
            if not column_embedding:
                continue
                
            similarity = self._calculate_cosine_similarity(target_embedding, column_embedding)
            if similarity > 0:
                similarities.append({
                    'column_doc': column_doc,
                    'similarity': similarity,
                    'column_id': column_id,
                    'column_label': column_data.get('label', 'Unknown'),
                    'parent_id': parent_id
                })
        
        # Sort by similarity descending and return top K
        similarities.sort(key=lambda x: x['similarity'], reverse=True)
        return [item['column_doc'] for item in similarities[:top_k]]
    

    def _get_table_name_by_id(self, table_id: str) -> str:
        """Get table name by table ID"""
        try:
            table_doc = self.table_collection.find_one({"data.id": table_id})
            if table_doc:
                return table_doc.get('data', {}).get('label', table_id)
            return table_id
        except Exception as e:
            print(f"    Error getting table name for ID {table_id}: {str(e)}")
            return table_id


#     def _create_relationship_inference_prompt(self) -> str:
#         """Create system prompt for relationship inference"""
#         return """You are a database relationship expert specializing in inferring foreign key relationships and table references.

# Your task is to analyze a target table and its similar tables/columns to identify potential relationships.

# **CRITICAL REQUIREMENTS:**
# 1. YOU MUST ALWAYS provide a complete, valid JSON response
# 2. YOU MUST NEVER provide incomplete responses or explanations  
# 3. YOU MUST respond with ONLY the JSON structure - no additional text, explanations, or markdown formatting
# 4. Generate relationship inferences based on semantic similarity and structural analysis

# **RESPONSE FORMAT:**
# Respond with ONLY a valid JSON object in exactly this structure (no markdown, no code blocks, no explanations):

# {
#   "foreign_keys": [
#     {
#       "target_table_name": "<target_table_name>",
#       "linking_column": "<column_name_that_links_tables>",
#       "relation_description": "<concise description with relationship type and business context>"
#     }
#   ],
#   "referencing_tables": [
#     {
#       "to_table": "<referencing_table_name>",
#       "linking_column": "<column_name_that_links_tables>", 
#       "relation_description": "<concise description with relationship type and business context>"
#     }
#   ]
# }

# **RELATIONSHIP INFERENCE GUIDELINES:**

# **For Foreign Keys:**
# - Identify tables that the target table likely references (target table has foreign key pointing to another table)
# - Look for semantic indicators: similar column names, data types, business logic patterns
# - Focus on "belongs to" or "references" relationships
# - Example: "Orders table references Customers table via customer_id"

# **For Referencing Tables:**
# - Identify tables that likely reference the target table (other tables have foreign keys pointing to target table)
# - Look for tables that would logically depend on or link to the target table
# - Focus on "has many" or "is referenced by" relationships  
# - Example: "Orders table is referenced by OrderItems table via order_id"

# **Linking Column Guidelines:**
# - Identify the specific column name that creates the relationship link
# - Look for common naming patterns: id, foreign_key_name, table_name_id
# - Base this on semantic similarity and column name patterns from the provided data
# - If uncertain about exact column name, use the most likely candidate based on naming conventions

# **Relation Description Format:**
# - Start with relationship type (one-to-one, one-to-many, many-to-one, many-to-many)
# - Include business context and purpose
# - Keep descriptions concise (1-2 sentences maximum)
# - Examples:
#   * "One-to-many: Each customer can have multiple orders for tracking purchase history"
#   * "Many-to-one: Multiple products belong to one category for organization"
#   * "One-to-one: Each user has one profile for storing detailed information"

# **IMPORTANT:**
# - Only include relationships with high confidence based on semantic similarity
# - Avoid speculative relationships without clear semantic indicators
# - Each relationship should have a meaningful business justification
# - If no clear relationships are found, return empty arrays

# **REMEMBER:** Respond with ONLY the JSON object. No explanations, no markdown formatting, no code blocks."""


    def _create_relationship_inference_prompt(self) -> str:
        """Load Relationship inference prompt from file""" 
        try:
            with open('prompts/relationship_inference.txt', 'r') as file:
                prompt = file.read().strip()
            return prompt
        except Exception as e:
            print(f"Error loading relationship inference prompt: {str(e)}")
            return "You are a database relationship expert specializing in inferring foreign key relationships and table references. Please analyze the provided data and respond with a valid JSON object containing inferred relationships."
        
    
    def _create_relationship_user_prompt(self, target_table: Dict[str, Any], similar_tables: List[Dict[str, Any]], similar_columns: List[Dict[str, Any]]) -> str:
        """Create user prompt for relationship inference"""
        
        target_data = target_table.get('data', {})
        target_info = f"""**TARGET TABLE:**
    - Table ID: {target_data.get('id', 'N/A')}
    - Table Label: {target_data.get('label', 'N/A')}
    - Table Type: {target_data.get('type', 'N/A')}
    - Description: {target_data.get('description', 'N/A')}
    - Embedding Input: {target_table.get('embedding_input', 'N/A')}
    - Current Foreign Keys: {target_table.get('foreign_keys', [])}
    - Current Referencing Tables: {target_table.get('referencing_tables', [])}"""
        
        similar_tables_info = "**SIMILAR TABLES (Top 5):**\n"
        for i, table_doc in enumerate(similar_tables, 1):
            table_data = table_doc.get('data', {})
            similar_tables_info += f"""
    Table {i}:
    - Table ID: {table_data.get('id', 'N/A')}
    - Table Label: {table_data.get('label', 'N/A')}
    - Table Type: {table_data.get('type', 'N/A')}
    - Description: {table_data.get('description', 'N/A')}
    - Embedding Input: {table_doc.get('embedding_input', 'N/A')}"""
        
        similar_columns_info = "**SIMILAR COLUMNS (Top 5):**\n"
        for i, column_doc in enumerate(similar_columns, 1):
            column_data = column_doc.get('data', {})
            similar_columns_info += f"""
    Column {i}:
    - Column ID: {column_data.get('id', 'N/A')}
    - Column Label: {column_data.get('label', 'N/A')}
    - Data Type: {column_data.get('data_type', 'N/A')}
    - Parent Table ID: {column_data.get('parent_id', 'N/A')}
    - Description: {column_data.get('description', 'N/A')}
    - Embedding Input: {column_doc.get('embedding_input', 'N/A')}"""
        
        return f"""Analyze the following target table and its semantically similar tables/columns to infer potential relationships:

    {target_info}

    {similar_tables_info}

    {similar_columns_info}

    **ANALYSIS FOCUS:**
    1. **Foreign Key Relationships**: Which of the similar tables does the target table likely reference? Look for semantic patterns that suggest the target table has foreign keys pointing to other tables.

    2. **Referencing Relationships**: Which of the similar tables (or tables containing similar columns) likely reference the target table? Look for patterns suggesting other tables have foreign keys pointing to the target table.

    3. **Semantic Indicators**: Consider column names, data types, business context, and logical relationships between entities.

    **Requirements:**
    - Only suggest relationships with high confidence based on semantic similarity
    - Provide clear, business-focused relation descriptions
    - Avoid speculative relationships without semantic justification
    - Consider the embedding similarity as an indicator of semantic relatedness

    Respond with ONLY the JSON object - no explanations, no markdown, no code blocks."""

    def _update_table_relationships(self, table_id: str, foreign_keys: List[Dict[str, Any]], referencing_tables: List[Dict[str, Any]]) -> bool:
        """Update table document with inferred relationships"""
        try:
            # Get current relationships
            current_table = self.table_collection.find_one({"data.id": table_id})
            if not current_table:
                return False
                
            # Convert foreign_keys to only include column names
            # updated_fks = [fk.get('linking_column', '') for fk in foreign_keys]

            #keep the full foreign key object instance of just column names
            updated_fks = foreign_keys
            
            # Convert referencing_tables to the required format
            updated_refs = []
            for ref in referencing_tables:
                updated_refs.append({
                    "to_table": ref.get('to_table', ''),
                    "linking_column": ref.get('linking_column', ''),
                    "relation_description": ref.get('relation_description', '')
                })
            
            # Prepare update document - always update these fields
            update_doc = {
                "$set": {
                    "foreign_keys": updated_fks,
                    "referencing_tables": updated_refs
                }
            }
            
            # Log the query being built
            table_name = current_table.get('data', {}).get('label', table_id)
            print(f"    Building update query for table: {table_name} (ID: {table_id})")
            print(f"    Query filter: {{'data.id': '{table_id}'}}")
            print(f"    Update operation: {update_doc}")
            print(f"    Foreign keys count: {len(updated_fks)}")
            print(f"    Referencing tables count: {len(updated_refs)}")
            
            result = self.table_collection.update_one(
                {"data.id": table_id},
                update_doc
            )
            
            print(f"    Update result - Modified count: {result.modified_count}, Matched count: {result.matched_count}")
            
            return result.matched_count > 0  # Return true if document was found and processed
            
        except Exception as e:
            print(f"    Error updating relationships for table {table_id}: {str(e)}")
            return False

    def _update_bidirectional_relationships(self, relationships: List[Dict[str, Any]]) -> None:
        """Update bidirectional relationships for all affected tables"""
        try:
            for relationship in relationships:
                relationship_type = relationship.get('type')  # 'foreign_key' or 'referencing'
                source_table_name = relationship.get('source_table_name')
                target_table_name = relationship.get('target_table_name') 
                linking_column = relationship.get('linking_column', '')
                relation_description = relationship.get('relation_description', '')
                
                if relationship_type == 'foreign_key':
                    # Update the target table's referencing_tables
                    target_table = self.table_collection.find_one({"data.label": target_table_name})
                    if target_table:
                        current_refs = target_table.get('referencing_tables', [])
                        # Check if this reverse relationship already exists
                        if not any(ref.get('to_table') == source_table_name for ref in current_refs):
                            # Create reverse relationship description
                            reverse_description = f"Referenced by {source_table_name}: {relation_description}"
                            new_ref = {
                                'to_table': source_table_name,
                                'linking_column': linking_column,
                                'relation_description': reverse_description
                            }
                            current_refs.append(new_ref)
                            
                            # Log the bidirectional update query
                            target_id = target_table.get('data', {}).get('id', '')
                            print(f"    Bidirectional update for table: {target_table_name} (ID: {target_id})")
                            print(f"    Adding referencing table: {new_ref}")
                            
                            self.table_collection.update_one(
                                {"data.label": target_table_name},
                                {"$set": {"referencing_tables": current_refs}}
                            )
                
                elif relationship_type == 'referencing':
                    # Update the source table's foreign_keys
                    source_table = self.table_collection.find_one({"data.label": source_table_name})
                    if source_table:
                        current_fks = source_table.get('foreign_keys', [])
                        current_table_name = relationship.get('current_table_name')
                        # Check if this reverse relationship already exists
                        if not any(fk.get('target_table_name') == current_table_name for fk in current_fks):
                            # Create reverse relationship description
                            reverse_description = f"References {current_table_name}: {relation_description}"
                            new_fk = {
                                'target_table_name': current_table_name,
                                'linking_column': linking_column,
                                'relation_description': reverse_description
                            }
                            current_fks.append(new_fk)
                            
                            # Log the bidirectional update query
                            source_id = source_table.get('data', {}).get('id', '')
                            print(f"    Bidirectional update for table: {source_table_name} (ID: {source_id})")
                            print(f"    Adding foreign key: {new_fk}")
                            
                            self.table_collection.update_one(
                                {"data.label": source_table_name},
                                {"$set": {"foreign_keys": current_fks}}
                            )
                            
        except Exception as e:
            print(f"    Error updating bidirectional relationships: {str(e)}")

                
    async def process_relationship_inference(self):
        """Process relationship inference for all tables (Task 3)"""
        print("\n" + "="*60)
        print("TASK 3: Starting relationship inference...")
        print("="*60)
        
        # Get all table and column documents with embeddings
        print("Loading all table and column documents...")
        all_tables = [doc for doc in self._get_all_table_documents() if doc.get('embedding_vector')]
        all_columns = [doc for doc in self._get_all_column_documents() if doc.get('embedding_vector')]
        
        if not all_tables:
            print("No tables with embeddings found for relationship inference")
            return False
        
        print(f"Found {len(all_tables)} tables and {len(all_columns)} columns with embeddings")
        
        total_tables = len(all_tables)
        processed_tables = 0
        total_relationships_added = 0
        all_bidirectional_updates = []
        
        for idx, target_table in enumerate(all_tables, 1):
            target_data = target_table.get('data', {})
            table_id = target_data.get('id')
            table_name = target_data.get('label', 'Unknown')
            
            print(f"\nProcessing table {idx}/{total_tables}: {table_name} (ID: {table_id})")
            
            # Find similar tables and columns
            print(f"  Finding similar tables and columns...")

            # Log the query for similar tables
            print(f"  Querying MongoDB for similar tables (Top 5)...")
            similar_tables_query = {"embedding_vector": {"$exists": True}}
            print(f"  MongoDB Query for similar tables: {similar_tables_query}")
            similar_tables = self._find_similar_tables(target_table, all_tables, top_k=5)

            # Log the query for similar columns
            print(f"  Querying MongoDB for similar columns (Top 5)...")
            similar_columns_query = {"embedding_vector": {"$exists": True}}
            print(f"  MongoDB Query for similar columns: {similar_columns_query}")
            similar_columns = self._find_similar_columns(target_table, all_columns, top_k=5)

            
            
            if not similar_tables and not similar_columns:
                print(f"  No similar entities found for table {table_id}")
                continue
            
            # Query LLM for relationship inference
            print(f"  Querying LLM for relationship inference...")
            user_prompt = self._create_relationship_user_prompt(target_table, similar_tables, similar_columns)
            llm_response = await self._query_llm(self._create_relationship_inference_prompt(), user_prompt)
            
            if not llm_response:
                print(f"  Failed to get LLM response for table {table_id}")
                continue
            
            # Parse LLM response
            parsed_relationships = self._parse_llm_response(llm_response)
            
            if not parsed_relationships:
                print(f"  Failed to parse LLM response for table {table_id}")
                continue
            
            # Extract relationships
            foreign_keys = parsed_relationships.get("foreign_keys", [])
            referencing_tables = parsed_relationships.get("referencing_tables", [])
            
            # Update table relationships
            success = self._update_table_relationships(table_id, foreign_keys, referencing_tables)
            if success:
                processed_tables += 1
                relationships_count = len(foreign_keys) + len(referencing_tables)
                total_relationships_added += relationships_count
                print(f"   Updated {relationships_count} relationships for table {table_name}")
                
                # Prepare bidirectional updates
                for fk in foreign_keys:
                    all_bidirectional_updates.append({
                        'type': 'foreign_key',
                        'source_table_name': table_name,
                        'target_table_name': fk.get('target_table_name'),
                        'linking_column': fk.get('linking_column', ''),
                        'relation_description': fk.get('relation_description', '')
                    })
                
                for ref in referencing_tables:
                    all_bidirectional_updates.append({
                        'type': 'referencing',
                        'source_table_name': ref.get('to_table'),
                        'current_table_name': table_name,
                        'linking_column': ref.get('linking_column', ''),
                        'relation_description': ref.get('relation_description', '')
                    })
            else:
                print(f"   Failed to update relationships for table {table_name}")
        
        # Process bidirectional updates
        if all_bidirectional_updates:
            print(f"\nProcessing {len(all_bidirectional_updates)} bidirectional relationship updates...")
            self._update_bidirectional_relationships(all_bidirectional_updates)
            print(" Bidirectional relationships updated")
        
        print(f"\n{'='*50}")
        print(f"TASK 3 COMPLETE: Relationship inference finished!")
        print(f"Tables processed: {processed_tables}/{total_tables}")
        print(f"Total relationships added: {total_relationships_added}")
        print(f"{'='*50}")
        
        return processed_tables > 0

async def run_mongodb_metadata_task():
    """Task 1: Run MongoDB metadata generation only"""
    print("Starting MongoDB Metadata Generation Task...")
    print("="*60)
    
    config = Config()
    
    with MongoDBMetadataProcessor(config) as processor:
        success = await processor.process_metadata_generation()
        if success:
            print("MongoDB metadata task completed successfully!")
        else:
            print("MongoDB metadata task failed!")
        return success


def run_azure_search_task():
    """Task 2: Run Azure AI Search indexing only"""
    print("Starting Azure Search Indexing Task...")
    print("="*60)
    
    config = Config()
    
    if not config.SEARCH_ENDPOINT or not config.SEARCH_KEY:
        print("Azure AI Search credentials not provided. Please set AZURE_SEARCH_ENDPOINT and AZURE_SEARCH_ADMIN_KEY environment variables.")
        return False
    
    with MongoDBMetadataProcessor(config) as processor:
        success = processor.process_azure_search_indexing()
        if success:
            print("Azure Search indexing task completed successfully!")
        else:
            print("Azure Search indexing task failed!")
        return success

async def run_relationship_inference_task():
    """Task 3: Run relationship inference only"""
    print("Starting Relationship Inference Task...")
    print("="*60)
    
    config = Config()
    
    processor = MongoDBMetadataProcessor(config)
    
    try:
        success = await processor.process_relationship_inference()
        # success = processor.process_relationship_inference()
        if success:
            print("Relationship inference task completed successfully!")
        else:
            print("Relationship inference task failed!")
        return success
    finally:
        processor.client.close()

async def main(): 
    print("MongoDB Metadata Processor")
    print("="*80)
    
    # Task 1: MongoDB Metadata Generation (REQUIRED)
    mongodb_success = await run_mongodb_metadata_task()
    
    if not mongodb_success:
        print("\nTask 1 failed. Stopping pipeline - Task 1 is required for subsequent tasks.")
        print("="*80)
        exit(1)
    
    print("\n")
    
    # Task 2: Azure Search Indexing (OPTIONAL)
    # azure_success = run_azure_search_task()
    
    print("\n")
    
    # Task 3: Relationship Inference (RUNS if Task 1 succeeded, regardless of Task 2)
    relationship_success = await run_relationship_inference_task()
    
    print("\n" + "="*80)
    print("PIPELINE EXECUTION SUMMARY:")
    print(f"Task 1 (Metadata Generation): {' SUCCESS' if mongodb_success else ' FAILED'}")
    # print(f"Task 2 (Azure Search Indexing): {' SUCCESS' if azure_success else ' FAILED/SKIPPED'}")
    print(f"Task 3 (Relationship Inference): {' SUCCESS' if relationship_success else ' FAILED'}")
    
    # if mongodb_success and relationship_success:
    #     if azure_success:
    #         print("\nALL TASKS COMPLETED SUCCESSFULLY!")
    #     else:
    #         print("\nCore tasks completed successfully (Azure Search optional task failed/skipped)")
    # else:
    #     print("\nSome tasks failed - check logs above")
    # print("="*80)
    
    
if __name__ == "__main__":
    asyncio.run(main())
```





# Latest

```python
import json
import os
from datetime import datetime
from typing import Dict, List, Any, Optional
from langchain_openai import AzureChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from pymongo import MongoClient
from pymongo.database import Database
from pymongo.collection import Collection
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchIndex,
    SearchField,
    SearchFieldDataType,
    SimpleField,
    SearchableField,
    ComplexField
)
from azure.core.credentials import AzureKeyCredential
from dotenv import load_dotenv
import asyncio
import time
import gc

load_dotenv()

# Configuration - Externalized settings
class Config:
    # MongoDB Configuration
    MONGO_CONNECTION_STRING = os.getenv("MONGO_CONNECTION_STRING", "mongodb://localhost:27017/")
    DATABASE_NAME = os.getenv("DATABASE_NAME", "COC")
    TABLE_COLLECTION_NAME = os.getenv("TABLE_COLLECTION_NAME", "table_metadata")
    COLUMN_COLLECTION_NAME = os.getenv("COLUMN_COLLECTION_NAME", "column_metadata")
    
    # Azure AI Search Configuration
    SEARCH_ENDPOINT = os.getenv("AZURE_SEARCH_ENDPOINT")
    SEARCH_KEY = os.getenv("AZURE_SEARCH_ADMIN_KEY")
    TABLE_SEARCH_INDEX = os.getenv("TABLE_SEARCH_INDEX", "table_metadata_index")
    COLUMN_SEARCH_INDEX = os.getenv("COLUMN_SEARCH_INDEX", "column_metadata_index")
    
    # Azure OpenAI Configuration
    INFERENCE_MODEL = os.getenv("INFERENCE_MODEL", "gpt-4o-mini")
    OPENAI_API_VERSION = os.getenv("OPENAI_API_VERSION", "2023-12-01-preview")
    OPENAI_API_URL = os.getenv("OPENAI_API_URL")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

    # Azure OpenAI Embeddings Configuration
    EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-ada-002")
    EMBEDDING_DIMENSIONS = int(os.getenv("EMBEDDING_DIMENSIONS", "3072"))

class MongoDBMetadataProcessor:
    def __init__(self, config: Config = None):
        """
        Initialize the processor with externalized configuration
        
        Args:
            config: Configuration object containing all settings
        """
        self.config = config or Config()
        
        # Initialize MongoDB connection
        self.client = MongoClient(self.config.MONGO_CONNECTION_STRING)
        self.db: Database = self.client[self.config.DATABASE_NAME]
        self.table_collection: Collection = self.db[self.config.TABLE_COLLECTION_NAME]
        self.column_collection: Collection = self.db[self.config.COLUMN_COLLECTION_NAME]
        
        # Add these missing attributes
        self.search_endpoint = self.config.SEARCH_ENDPOINT
        self.search_key = self.config.SEARCH_KEY

        # Initialize Azure AI Search clients if credentials provided
        self.search_credential = None
        self.search_index_client = None
        self.table_search_client = None
        self.column_search_client = None
        
        if self.search_endpoint and self.search_key:
            self.search_credential = AzureKeyCredential(self.search_key)
            self.search_index_client = SearchIndexClient(
                endpoint=self.search_endpoint,
                credential=self.search_credential
            )
        
        # Initialize Azure OpenAI LLM
        self.llm = AzureChatOpenAI(
            azure_deployment=self.config.INFERENCE_MODEL,
            openai_api_version=self.config.OPENAI_API_VERSION,
            azure_endpoint=self.config.OPENAI_API_URL,
            api_key=self.config.OPENAI_API_KEY,
            temperature=0
        )

        # Initialize Azure OpenAI Embeddings client
        self.embedding_llm = AzureChatOpenAI(
            azure_deployment=self.config.EMBEDDING_MODEL,
            openai_api_version=self.config.OPENAI_API_VERSION,
            azure_endpoint=self.config.OPENAI_API_URL,
            api_key=self.config.OPENAI_API_KEY,
            temperature=0
        )
        
        print(f"Connected to MongoDB database: {self.config.DATABASE_NAME}")
        print(f"Table collection: {self.table_collection.count_documents({})}")
        print(f"Column collection: {self.column_collection.count_documents({})}")
        
        if self.config.SEARCH_ENDPOINT:
            print(f"Azure AI Search endpoint configured: {self.config.SEARCH_ENDPOINT}")
        
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Close MongoDB connection when exiting context"""
        self.client.close()
    
    def _get_table_documents_batch(self, skip: int, limit: int = 4) -> List[Dict[str, Any]]:
        """Retrieve a batch of table documents from MongoDB using pagination"""
        try:
            cursor = self.table_collection.find({}).skip(skip).limit(limit)
            tables = list(cursor)
            print(f"  Retrieved {len(tables)} tables from {skip} to {skip + len(tables)}")
            return tables
        except Exception as e:
            print(f"Error retrieving batch of table documents: {str(e)}")
            return []
    
    def _get_total_table_count(self) -> int:
        """Get total number of table documents"""
        try:
            return self.table_collection.count_documents({})
        except Exception as e:
            print(f"Error counting table documents: {str(e)}")
            return 0
        
        
    def _get_all_table_documents(self) -> List[Dict[str, Any]]:
        """Retrieve all documents from table_metadata collection"""
        try:
            cursor = self.table_collection.find({})
            tables = list(cursor)
            print(f"Retrieved {len(tables)} table documents from MongoDB")
            return tables
        except Exception as e:
            print(f"Error retrieving table documents: {str(e)}")
            return []
    
    def _get_all_column_documents(self) -> List[Dict[str, Any]]:
        """Retrieve all documents from column_metadata collection"""
        try:
            cursor = self.column_collection.find({})
            columns = list(cursor)
            print(f"Retrieved {len(columns)} column documents from MongoDB")
            return columns
        except Exception as e:
            print(f"Error retrieving column documents: {str(e)}")
            return []
    
    def _get_columns_for_table(self, table_id: str) -> List[Dict[str, Any]]:
        """Retrieve all column documents for a specific table ID"""
        try:
            cursor = self.column_collection.find({"data.parent_id": table_id})
            columns = list(cursor)
            print(f"  Retrieved {len(columns)} column documents for table ID: {table_id}")
            return columns
        except Exception as e:
            print(f"  Error retrieving column documents for table {table_id}: {str(e)}")
            return []
    
    def _create_system_prompt(self) -> str:
        """Create system prompt for LLM processing"""
        return """You are a data analyst expert specializing in creating comprehensive metadata for database tables and columns.

Your task is to analyze table and column information and generate detailed metadata for the specified fields only.

**CRITICAL REQUIREMENTS:**
1. YOU MUST ALWAYS provide a complete, valid JSON response
2. YOU MUST NEVER provide incomplete responses or explanations  
3. YOU MUST respond with ONLY the JSON structure - no additional text, explanations, or markdown formatting
4. Generate metadata for ONLY the requested fields: description, embedding_input, tags, and foreign_keys_referencing_tables

**RESPONSE FORMAT:**
Respond with ONLY a valid JSON object in exactly this structure (no markdown, no code blocks, no explanations):

{
  "table_metadata": {
    "description": "<concise_description_for_UI>",
    "embedding_input": "<detailed_description_for_embedding>", 
    "tags": ["<tag1>", "<tag2>", "<tag3>"],
    "foreign_keys_referencing_tables": ["<column_name1>", "<column_name2>"]
  },
  "columns_metadata": [
    {
      "column_id": "<column_id>",
      "description": "<concise_description_for_UI>",
      "embedding_input": "<detailed_description_for_embedding>",
      "tags": ["<tag1>", "<tag2>", "<tag3>"]
    }
  ]
}

**FIELD GUIDELINES:**

**For Table:**
- **description**: Concise description (1 sentence) suitable for UI rendering
- **embedding_input**: For embedding purposes, the table-level description should be comprehensive, covering the business description, technical structure, and intended purpose of the table. It should explain what the table represents, how it supports key business processes, and the nature of the data it stores. The description must also detail the table's structure, such as how it is organized, key identifiers, and any important constraints. Including synonyms or alternate names helps improve semantic understanding during embedding.
- **tags**: Provide 1-3 relevant tags for searchability
- **foreign_keys_referencing_tables**: CRITICAL - Infer which columns are likely to serve as foreign keys by understanding their semantic meaning and relational intent. Focus on identifying columns that are likely referencing other tables, typically serving as links between related entities. Consider the following signals (not strict rules):
    * Column names that suggest relationships (e.g., include terms like "id", "key", or entity names)
    * Data types commonly used for identifiers (e.g., integer, UUID, string)
    * Naming patterns or semantic clues that imply linkage to another table
    * Columns that are contextually significant for joining records across entities
    * Return an array of column names (not IDs) that are most likely acting as foreign keys based on their meaning and role in relational structure.

**For Columns:**
- **column_id**: Use the exact column ID from input
- **description**: Concise description (1 sentence) suitable for UI rendering  
- **embedding_input**: For embedding purposes, each column must have a detailed and enriched description that captures its data type, applicable constraints (e.g., primary key, nullable, unique), and its functional purpose within the table. The description should clearly explain what the column represents, how it is used in business or technical workflows, and why it is important. Additionally, include any relevant synonyms or alternate labels to enhance semantic understanding and support more effective retrieval during search.
- **tags**: Provide 1-3 relevant tags for searchability

**REMEMBER:** Respond with ONLY the JSON object. No explanations, no markdown formatting, no code blocks."""
    
    def _create_user_prompt(self, table_doc: Dict[str, Any], column_docs: List[Dict[str, Any]]) -> str:
        """Create user prompt with table and column information"""
        
        # Extract table information
        table_data = table_doc.get('data', {})
        table_info = f"""**Table Information:**
- Table ID: {table_data.get('id', 'N/A')}
- Table Label: {table_data.get('label', 'N/A')}
- Table Type: {table_data.get('type', 'N/A')}
- Parent Type: {table_data.get('parent_type', 'N/A')}
- Parent ID: {table_data.get('parent_id', 'N/A')}
- Parent Name: {table_data.get('parent_name', 'N/A')}
- Primary Keys: {table_doc.get('primary_keys', [])}
- Foreign Keys (if known): {table_doc.get('foreign_keys_referencing_tables', [])}
- Referencing Tables: {table_doc.get('primary_keys_referencing_tables', [])}"""
        
        # Extract column information
        columns_info = "**Columns Information:**\n"
        for i, col_doc in enumerate(column_docs, 1):
            col_data = col_doc.get('data', {})

            columns_info += f"""
Column {i}:
- Column ID: {col_data.get('id', 'N/A')}
- Column Label: {col_data.get('label', 'N/A')}
- Data Type: {col_data.get('data_type', 'N/A')}
- Nullable: {col_data.get('nullable', 'N/A')}
- Sample Values: {col_doc.get('sample_values', [])}
- Foreign Key Indicators: <LLM to analyze based on name, type, and sample values> """

        return f"""Analyze the following table and column data to generate comprehensive metadata:

{table_info}

{columns_info}

**SPECIAL FOCUS ON FOREIGN KEY DETECTION:**
Look for columns that could be foreign keys by analyzing:
1. Column names ending with '_id', '_key', or containing 'id' 
2. Data types suitable for keys (int, bigint, uuid, varchar with key patterns)
3. Column names that suggest references to other entities
4. Patterns indicating relationships (customer_id, user_id, order_id, etc.)

**Requirements:**
- Generate meaningful descriptions and embedding inputs based on the table and column information
- Create relevant tags for searchability
- CRITICALLY IMPORTANT: Analyze and infer probable foreign key columns for the table
- Use the table structure and column details to infer business context
- Include all column IDs in the response for proper mapping

Respond with ONLY the JSON object - no explanations, no markdown, no code blocks."""

    
    async def _query_llm(self, system_prompt: str, user_prompt: str) -> Optional[str]:
        """Asynchronously query the LLM with the given prompts"""
        try:
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt)
            ]
            
            response = await self.llm.ainvoke(messages)
            return response.content
        except Exception as e:
            print(f"    Error querying LLM: {str(e)}")
            return None
    
    def _parse_llm_response(self, response: str) -> Optional[Dict[str, Any]]:
        """Parse LLM response to extract the metadata JSON"""
        try:
            # Clean the response - remove any markdown formatting
            clean_response = response.strip()
            
            # Remove code block markers if present
            if clean_response.startswith('```'):
                lines = clean_response.split('\n')
                if lines[0].strip() in ['```json', '```']:
                    lines = lines[1:]
                if lines and lines[-1].strip() == '```':
                    lines = lines[:-1]
                clean_response = '\n'.join(lines)
            
            # Try to find JSON object boundaries
            start_idx = clean_response.find('{')
            if start_idx == -1:
                print("    No JSON object found in response")
                return None
            
            # Find the matching closing brace
            brace_count = 0
            end_idx = -1
            for i in range(start_idx, len(clean_response)):
                if clean_response[i] == '{':
                    brace_count += 1
                elif clean_response[i] == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        end_idx = i
                        break
            
            if end_idx == -1:
                print("    Could not find matching closing brace")
                return None
            
            json_str = clean_response[start_idx:end_idx+1]
            
            # Parse JSON string
            metadata_json = json.loads(json_str)
            
            return metadata_json
            
        except json.JSONDecodeError as e:
            print(f"    JSON decode error: {str(e)}")
            return None
        except Exception as e:
            print(f"    Error parsing LLM response: {str(e)}")
            return None
    
    def _generate_embedding(self, text: str) -> Optional[List[float]]:
        """Generate embedding for given text using Azure OpenAI"""
        try:
            if not text or not text.strip():
                return None
            
            # Use Azure OpenAI embeddings API
            from openai import AzureOpenAI
            
            client = AzureOpenAI(
                api_key=self.config.OPENAI_API_KEY,
                api_version=self.config.OPENAI_API_VERSION,
                azure_endpoint=self.config.OPENAI_API_URL
            )
            
            response = client.embeddings.create(
                input=text.strip(),
                model=self.config.EMBEDDING_MODEL
            )
            
            embedding = response.data[0].embedding
            return embedding
            
        except Exception as e:
            print(f"    Error generating embedding: {str(e)}")
            return None



    def _update_table_document(self, table_id: str, table_metadata: Dict[str, Any]) -> bool:
        """Update table document in MongoDB with generated metadata and embedding"""
        try:
            # Generate embedding for embedding_input
            embedding_input = table_metadata.get("embedding_input", "")
            embedding_vector = None
            
            if embedding_input and embedding_input.strip():
                print(f"      Generating embedding for table {table_id}...")
                embedding_vector = self._generate_embedding(embedding_input)
                if embedding_vector:
                    print(f"       Generated embedding ({len(embedding_vector)} dimensions)")
                else:
                    print(f"       Failed to generate embedding")
            
            update_doc = {
                "$set": {
                    "data.description": table_metadata.get("description", ""),
                    "embedding_input": embedding_input,
                    "embedding_vector": embedding_vector,  # Add embedding vector
                    "tags": table_metadata.get("tags", []),
                    "foreign_keys_referencing_tables": table_metadata.get("foreign_keys_referencing_tables", []),
                    "last_updated_by": "user_ai",
                    "updated_at": datetime.utcnow().isoformat() + "Z"
                }
            }
            
            result = self.table_collection.update_one(
                {"data.id": table_id},
                update_doc
            )
            
            if result.modified_count > 0:
                print(f"     Updated table document for ID: {table_id}")
                # Print foreign keys if found
                foreign_keys_referencing_tables = table_metadata.get("foreign_keys_referencing_tables", [])
                if foreign_keys_referencing_tables:
                    print(f"      Inferred foreign keys: {foreign_keys_referencing_tables}")
                return True
            else:
                print(f"     No table document updated for ID: {table_id}")
                return False
                
        except Exception as e:
            print(f"     Error updating table document {table_id}: {str(e)}")
            return False

    def _update_column_documents(self, columns_metadata: List[Dict[str, Any]]) -> int:
        """Update column documents in MongoDB with generated metadata and embeddings"""
        updated_count = 0
        
        for col_metadata in columns_metadata:
            try:
                column_id = col_metadata.get("column_id")
                if not column_id:
                    print(f"       No column_id found in metadata")
                    continue
                
                # Generate embedding for embedding_input
                embedding_input = col_metadata.get("embedding_input", "")
                embedding_vector = None
                
                if embedding_input and embedding_input.strip():
                    print(f"        Generating embedding for column {column_id}...")
                    embedding_vector = self._generate_embedding(embedding_input)
                    if embedding_vector:
                        print(f"         Generated embedding ({len(embedding_vector)} dimensions)")
                    else:
                        print(f"         Failed to generate embedding")
                
                update_doc = {
                    "$set": {
                        "data.description": col_metadata.get("description", ""),
                        "embedding_input": embedding_input,
                        "embedding_vector": embedding_vector,  # Add embedding vector
                        "tags": col_metadata.get("tags", []),
                        "last_updated_by": "user_ai",
                        "updated_at": datetime.utcnow().isoformat() + "Z"
                    }
                }
                
                result = self.column_collection.update_one(
                    {"data.id": column_id},
                    update_doc
                )
                
                if result.modified_count > 0:
                    print(f"       Updated column document for ID: {column_id}")
                    updated_count += 1
                else:
                    print(f"       No column document updated for ID: {column_id}")
                    
            except Exception as e:
                print(f"       Error updating column document {column_id}: {str(e)}")
        
        return updated_count
        
    def _create_table_search_index(self) -> bool:
        """Create Azure AI Search index for tables with vector field"""
        try:
            fields = [
                SimpleField(name="id", type=SearchFieldDataType.String, key=True),
                SearchableField(name="label", type=SearchFieldDataType.String),
                SearchableField(name="type", type=SearchFieldDataType.String),
                SearchableField(name="parent_type", type=SearchFieldDataType.String),
                SimpleField(name="parent_id", type=SearchFieldDataType.String),
                SearchableField(name="parent_name", type=SearchFieldDataType.String),
                SearchableField(name="description", type=SearchFieldDataType.String),
                SearchableField(name="embedding_input", type=SearchFieldDataType.String),
                # Add vector field for embeddings
                SearchField(
                    name="embedding_vector",
                    type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
                    searchable=True,
                    vector_search_dimensions=self.config.EMBEDDING_DIMENSIONS,
                    vector_search_profile_name="default"
                ),
                SearchableField(name="tags", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
                SimpleField(name="primary_keys", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
                SimpleField(name="foreign_keys_referencing_tables", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
                SimpleField(name="primary_keys_referencing_tables", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
                SimpleField(name="created_by", type=SearchFieldDataType.String),
                SimpleField(name="created_at", type=SearchFieldDataType.DateTimeOffset),
                SimpleField(name="last_updated_by", type=SearchFieldDataType.String),
                SimpleField(name="updated_at", type=SearchFieldDataType.DateTimeOffset),
                ComplexField(name="human_feedback", fields=[
                    SimpleField(name="user", type=SearchFieldDataType.String),
                    SearchableField(name="comment", type=SearchFieldDataType.String),
                    SimpleField(name="timestamp", type=SearchFieldDataType.String)
                ])
            ]
            
            # Configure vector search
            from azure.search.documents.indexes.models import (
                VectorSearch, HnswAlgorithmConfiguration, VectorSearchProfile, SemanticConfiguration
            )
            
            vector_search = VectorSearch(
                algorithms=[
                    HnswAlgorithmConfiguration(
                        name="default-hnsw",
                        parameters={
                            "m": 4,
                            "efConstruction": 400,
                            "efSearch": 500,
                            "metric": "cosine"
                        }
                    )
                ],
                profiles=[
                    VectorSearchProfile(
                        name="default",
                        algorithm_configuration_name="default-hnsw"
                    )
                ]
            )
            
            index = SearchIndex(
                name=self.config.TABLE_SEARCH_INDEX, 
                fields=fields,
                vector_search=vector_search
            )
        
            # Create or update the index
            result = self.search_index_client.create_or_update_index(index)
            print(f" Created/Updated table search index with vector support: {self.config.TABLE_SEARCH_INDEX}")
            
            # Initialize search client for tables
            self.table_search_client = SearchClient(
                endpoint=self.config.SEARCH_ENDPOINT,
                index_name=self.config.TABLE_SEARCH_INDEX,
                credential=self.search_credential
            )
            
            return True
            
        except Exception as e:
            print(f" Error creating table search index: {str(e)}")
            return False

    def _create_column_search_index(self) -> bool:
        """Create Azure AI Search index for columns with vector field"""
        try:
            fields = [
                SimpleField(name="id", type=SearchFieldDataType.String, key=True),
                SearchableField(name="label", type=SearchFieldDataType.String),
                SearchableField(name="data_type", type=SearchFieldDataType.String),
                SimpleField(name="nullable", type=SearchFieldDataType.Boolean),
                SimpleField(name="parent_id", type=SearchFieldDataType.String),
                SearchableField(name="parent_name", type=SearchFieldDataType.String),
                SearchableField(name="parent_type", type=SearchFieldDataType.String),
                SearchableField(name="description", type=SearchFieldDataType.String),
                SearchableField(name="embedding_input", type=SearchFieldDataType.String),
                # Add vector field for embeddings
                SearchField(
                    name="embedding_vector",
                    type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
                    searchable=True,
                    vector_search_dimensions=self.config.EMBEDDING_DIMENSIONS,
                    vector_search_profile_name="default"
                ),
                SearchableField(name="tags", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
                SimpleField(name="sample_values", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
                SimpleField(name="created_by", type=SearchFieldDataType.String),
                SimpleField(name="created_at", type=SearchFieldDataType.DateTimeOffset),
                SimpleField(name="last_updated_by", type=SearchFieldDataType.String),
                SimpleField(name="updated_at", type=SearchFieldDataType.DateTimeOffset),
                ComplexField(name="human_feedback", fields=[
                    SimpleField(name="user", type=SearchFieldDataType.String),
                    SearchableField(name="comment", type=SearchFieldDataType.String),
                    SimpleField(name="timestamp", type=SearchFieldDataType.String)
                ])
            ]
            
            # Configure vector search (same as tables)
            from azure.search.documents.indexes.models import (
                VectorSearch, HnswAlgorithmConfiguration, VectorSearchProfile
            )
            
            vector_search = VectorSearch(
                algorithms=[
                    HnswAlgorithmConfiguration(
                        name="default-hnsw",
                        parameters={
                            "m": 4,
                            "efConstruction": 400,
                            "efSearch": 500,
                            "metric": "cosine"
                        }
                    )
                ],
                profiles=[
                    VectorSearchProfile(
                        name="default",
                        algorithm_configuration_name="default-hnsw"
                    )
                ]
            )
            
            index = SearchIndex(
                name=self.config.COLUMN_SEARCH_INDEX, 
                fields=fields,
                vector_search=vector_search
            )
        
            # Create or update the index
            result = self.search_index_client.create_or_update_index(index)
            print(f" Created/Updated column search index with vector support: {self.config.COLUMN_SEARCH_INDEX}")
            
            # Initialize search client for columns
            self.column_search_client = SearchClient(
                endpoint=self.config.SEARCH_ENDPOINT,
                index_name=self.config.COLUMN_SEARCH_INDEX,
                credential=self.search_credential
            )
            
            return True
            
        except Exception as e:
            print(f" Error creating column search index: {str(e)}")
            return False
    
    def _prepare_table_document_for_search(self, table_doc: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare table document for Azure AI Search indexing"""
        table_data = table_doc.get('data', {})
        
        # Check if embedding_input is empty - skip if so
        embedding_input = str(table_doc.get('embedding_input', '')).strip()
        if not embedding_input:
            return None  # Signal to skip this document
        
        def safe_datetime(value):
            """Safely convert datetime string to proper format"""
            if isinstance(value, str) and value.strip():
                try:
                    # Ensure the datetime string ends with Z for UTC
                    if not value.endswith('Z'):
                        return value + 'Z' if 'T' in value else value
                    return value
                except:
                    return datetime.utcnow().isoformat() + "Z"
            return datetime.utcnow().isoformat() + "Z"
        
        def clean_human_feedback(feedback_list):
            """Clean human feedback array to remove empty objects"""
            if not isinstance(feedback_list, list):
                return []
            
            cleaned_feedback = []
            for feedback in feedback_list:
                if isinstance(feedback, dict):
                    user = str(feedback.get('user', '')).strip()
                    comment = str(feedback.get('comment', '')).strip()
                    timestamp = str(feedback.get('timestamp', '')).strip()
                    
                    cleaned_feedback.append({
                        "user": user,
                        "comment": comment,
                        "timestamp": timestamp
                    })
            
            return cleaned_feedback
        
        def safe_list(value):
            """Safely convert value to list"""
            if isinstance(value, list):
                return [str(item) if item is not None else "" for item in value]
            return []
        
        def safe_string(value):
            """Safely convert value to string"""
            return str(value) if value is not None else ""
        
        # Prepare the complete document - DO NOT include embedding_vector from MongoDB
        search_doc = {
            "id": safe_string(table_data.get('id', '')),
            "label": safe_string(table_data.get('label', '')),
            "type": safe_string(table_data.get('type', '')),
            "parent_type": safe_string(table_data.get('parent_type', '')),
            "parent_id": safe_string(table_data.get('parent_id', '')),
            "parent_name": safe_string(table_data.get('parent_name', '')),
            "description": safe_string(table_data.get('description', '')),
            "embedding_input": embedding_input,  # This will be embedded by Azure AI Search
            # Note: embedding_vector will be auto-generated by Azure AI Search from embedding_input
            "tags": safe_list(table_doc.get('tags', [])),
            "primary_keys": safe_list(table_doc.get('primary_keys', [])),
            "foreign_keys_referencing_tables": safe_list(table_doc.get('foreign_keys_referencing_tables', [])),
            "primary_keys_referencing_tables": safe_list(table_doc.get('primary_keys_referencing_tables', [])),
            "created_by": safe_string(table_doc.get('created_by', '')),
            "created_at": safe_datetime(table_doc.get('created_at')),
            "last_updated_by": safe_string(table_doc.get('last_updated_by', '')),
            "updated_at": safe_datetime(table_doc.get('updated_at')),
            "human_feedback": clean_human_feedback(table_doc.get('human_feedback', []))
        }
        
        return search_doc


    def _prepare_column_document_for_search(self, column_doc: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare column document for Azure AI Search indexing"""
        column_data = column_doc.get('data', {})
        
        # Check if embedding_input is empty - skip if so
        embedding_input = str(column_doc.get('embedding_input', '')).strip()
        if not embedding_input:
            return None  # Signal to skip this document
        
        def safe_datetime(value):
            """Safely convert datetime string to proper format"""
            if isinstance(value, str) and value.strip():
                try:
                    # Ensure the datetime string ends with Z for UTC
                    if not value.endswith('Z'):
                        return value + 'Z' if 'T' in value else value
                    return value
                except:
                    return datetime.utcnow().isoformat() + "Z"
            return datetime.utcnow().isoformat() + "Z"
        
        def clean_human_feedback(feedback_list):
            """Clean human feedback array to remove empty objects"""
            if not isinstance(feedback_list, list):
                return []
            
            cleaned_feedback = []
            for feedback in feedback_list:
                if isinstance(feedback, dict):
                    user = str(feedback.get('user', '')).strip()
                    comment = str(feedback.get('comment', '')).strip()
                    timestamp = str(feedback.get('timestamp', '')).strip()
                    
                    cleaned_feedback.append({
                        "user": user,
                        "comment": comment,
                        "timestamp": timestamp
                    })
            
            return cleaned_feedback
        
        def safe_sample_values(values):
            """Safely convert sample values to strings"""
            if not isinstance(values, list):
                return []
            
            safe_values = []
            for value in values:
                if value is not None:
                    safe_values.append(str(value))
                else:
                    safe_values.append("")
            
            return safe_values
        
        def safe_list(value):
            """Safely convert value to list"""
            if isinstance(value, list):
                return [str(item) if item is not None else "" for item in value]
            return []
        
        def safe_string(value):
            """Safely convert value to string"""
            return str(value) if value is not None else ""
        
        def safe_boolean(value):
            """Safely convert value to boolean"""
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                return value.lower() in ('true', '1', 'yes')
            return bool(value) if value is not None else False
        
        # Prepare the complete document - DO NOT include embedding_vector from MongoDB
        search_doc = {
            "id": safe_string(column_data.get('id', '')),
            "label": safe_string(column_data.get('label', '')),
            "data_type": safe_string(column_data.get('data_type', '')),
            "nullable": safe_boolean(column_data.get('nullable', False)),
            "parent_id": safe_string(column_data.get('parent_id', '')),
            "parent_name": safe_string(column_data.get('parent_name', '')),
            "parent_type": safe_string(column_data.get('parent_type', '')),
            "description": safe_string(column_data.get('description', '')),
            "embedding_input": embedding_input,  # This will be embedded by Azure AI Search
            # Note: embedding_vector will be auto-generated by Azure AI Search from embedding_input
            "tags": safe_list(column_doc.get('tags', [])),
            "sample_values": safe_sample_values(column_doc.get('sample_values', [])),
            "created_by": safe_string(column_doc.get('created_by', '')),
            "created_at": safe_datetime(column_doc.get('created_at')),
            "last_updated_by": safe_string(column_doc.get('last_updated_by', '')),
            "updated_at": safe_datetime(column_doc.get('updated_at')),
            "human_feedback": clean_human_feedback(column_doc.get('human_feedback', []))
        }
        
        return search_doc


    def _index_table_documents(self) -> int:
        """Index all table documents to Azure AI Search"""
        if not self.table_search_client:
            print(" Table search client not initialized")
            return 0
        
        print("\nStarting table documents indexing to Azure AI Search...")
        
        # Get all updated table documents from MongoDB
        table_documents = self._get_all_table_documents()
        
        if not table_documents:
            print("No table documents found for indexing")
            return 0
        
        indexed_count = 0
        failed_count = 0
        skipped_count = 0  # Track skipped documents
        batch_documents = []
        batch_size = 50
        
        for i, table_doc in enumerate(table_documents):
            try:
                # Prepare document for search indexing
                search_doc = self._prepare_table_document_for_search(table_doc)
                
                # Skip documents with empty embedding_input
                if search_doc is None:
                    table_id = table_doc.get('data', {}).get('id', f'table_{i+1}')
                    print(f"   Skipping table {table_id}: Empty embedding_input")
                    skipped_count += 1
                    continue
                
                # Skip documents without valid ID
                if not search_doc.get("id"):
                    print(f"   Skipping table document {i+1}: Missing ID")
                    failed_count += 1
                    continue
                
                # Add merge or upload action
                search_doc["@search.action"] = "mergeOrUpload"
                batch_documents.append(search_doc)
                
                # Process in batches
                if len(batch_documents) >= batch_size:
                    try:
                        result = self.table_search_client.upload_documents(documents=batch_documents)
                        batch_indexed = len([r for r in result if r.succeeded])
                        batch_failed = len([r for r in result if not r.succeeded])
                        
                        indexed_count += batch_indexed
                        failed_count += batch_failed
                        
                        if batch_failed > 0:
                            print(f"   Batch had {batch_failed} failures")
                            for r in result:
                                if not r.succeeded:
                                    print(f"     Failed: {r.key} - {r.error_message}")
                        
                        batch_documents = []
                        
                    except Exception as batch_e:
                        print(f"   Error processing batch: {str(batch_e)}")
                        failed_count += len(batch_documents)
                        batch_documents = []
                        
            except Exception as e:
                table_id = table_doc.get('data', {}).get('id', f'table_{i+1}')
                print(f"   Error preparing table document {table_id} for indexing: {str(e)}")
                failed_count += 1
        
        # Process remaining documents
        if batch_documents:
            try:
                result = self.table_search_client.upload_documents(documents=batch_documents)
                batch_indexed = len([r for r in result if r.succeeded])
                batch_failed = len([r for r in result if not r.succeeded])
                
                indexed_count += batch_indexed
                failed_count += batch_failed
                
                if batch_failed > 0:
                    print(f"   Final batch had {batch_failed} failures")
                    for r in result:
                        if not r.succeeded:
                            print(f"     Failed: {r.key} - {r.error_message}")
                            
            except Exception as e:
                print(f"   Error indexing final batch of table documents: {str(e)}")
                failed_count += len(batch_documents)
        
        print(f"Indexed {indexed_count}/{len(table_documents)} table documents ({failed_count} failed, {skipped_count} skipped)")
        return indexed_count


    def _index_column_documents(self) -> int:
        """Index all column documents to Azure AI Search"""
        if not self.column_search_client:
            print("Column search client not initialized")
            return 0
        
        print("\nStarting column documents indexing to Azure AI Search...")
        
        # Get all updated column documents from MongoDB
        column_documents = self._get_all_column_documents()
        
        if not column_documents:
            print("No column documents found for indexing")
            return 0
        
        indexed_count = 0
        failed_count = 0
        skipped_count = 0  # Track skipped documents
        batch_documents = []
        batch_size = 50
        
        for i, column_doc in enumerate(column_documents):
            try:
                # Prepare document for search indexing
                search_doc = self._prepare_column_document_for_search(column_doc)
                
                # Skip documents with empty embedding_input
                if search_doc is None:
                    column_id = column_doc.get('data', {}).get('id', f'column_{i+1}')
                    print(f"   Skipping column {column_id}: Empty embedding_input")
                    skipped_count += 1
                    continue
                
                # Skip documents without valid ID
                if not search_doc.get("id"):
                    print(f"   Skipping column document {i+1}: Missing ID")
                    failed_count += 1
                    continue
                
                # Add merge or upload action
                search_doc["@search.action"] = "mergeOrUpload"
                batch_documents.append(search_doc)
                
                # Process in batches
                if len(batch_documents) >= batch_size:
                    try:
                        result = self.column_search_client.upload_documents(documents=batch_documents)
                        batch_indexed = len([r for r in result if r.succeeded])
                        batch_failed = len([r for r in result if not r.succeeded])
                        
                        indexed_count += batch_indexed
                        failed_count += batch_failed
                        
                        if batch_failed > 0:
                            print(f"   Batch had {batch_failed} failures")
                            for r in result:
                                if not r.succeeded:
                                    print(f"     Failed: {r.key} - {r.error_message}")
                        
                        batch_documents = []
                        
                    except Exception as batch_e:
                        print(f"   Error processing batch: {str(batch_e)}")
                        failed_count += len(batch_documents)
                        batch_documents = []
                        
            except Exception as e:
                column_id = column_doc.get('data', {}).get('id', f'column_{i+1}')
                print(f"   Error preparing column document {column_id} for indexing: {str(e)}")
                failed_count += 1
        
        # Process remaining documents
        if batch_documents:
            try:
                result = self.column_search_client.upload_documents(documents=batch_documents)
                batch_indexed = len([r for r in result if r.succeeded])
                batch_failed = len([r for r in result if not r.succeeded])
                
                indexed_count += batch_indexed
                failed_count += batch_failed
                
                if batch_failed > 0:
                    print(f"   Final batch had {batch_failed} failures")
                    for r in result:
                        if not r.succeeded:
                            print(f"     Failed: {r.key} - {r.error_message}")
                            
            except Exception as e:
                print(f"   Error indexing final batch of column documents: {str(e)}")
                failed_count += len(batch_documents)
        
        print(f" Indexed {indexed_count}/{len(column_documents)} column documents ({failed_count} failed, {skipped_count} skipped)")
        return indexed_count
    
    async def process_metadata_generation(self, batch_size: int = 4):
        """Process metadata generation for batch of tables  (Task 1)"""
        print("="*60)
        print("TASK 1: Starting metadata generation...")
        print("="*60)
        
        total_tables = self._get_total_table_count()
        print(f"Total tables to process: {total_tables}")
        total_start_time = time.perf_counter()
        
        processed_tables = 0
        total_columns_updated = 0
        skip = 0
        
        
        while skip < total_tables:
            batch_start_time = time.perf_counter()
            table_batch = self._get_table_documents_batch(skip, batch_size)

            if not table_batch:
                break

            print(f"\nBatch {skip + 1} to {skip + len(table_batch)}")

            # Run processing for this batch in parallel
            tasks = [
                self._process_table(skip + idx + 1, table_doc)
                for idx, table_doc in enumerate(table_batch)
            ]
            results = await asyncio.gather(*tasks)
            
            batch_end_time = time.perf_counter()  # 🔁 End batch timer
            print(f"🕒 Time taken for batch: {batch_end_time - batch_start_time:.2f} seconds")

            # Aggregate results
            processed_tables += sum(r["tables"] for r in results)
            total_columns_updated += sum(r["columns"] for r in results)

            skip += batch_size
            
    
            total_end_time = time.perf_counter()
        
        print(f"\n{'='*50}")
        print(f"TASK 1 COMPLETE: Metadata generation finished!")
        print(f"Tables processed: {processed_tables}/{total_tables}")
        print(f"Columns updated: {total_columns_updated}")
        print(f"🕒 Total time taken: {total_end_time - total_start_time:.2f} seconds")
        print(f"{'='*50}")
        
        return processed_tables > 0 or total_columns_updated > 0
    
    
    async def _process_table(self, index: int, table_doc: Dict[str, Any]) -> Dict[str, int]:
        """Process metadata generation for a single table (async LLM call)"""
        try:
            table_id = table_doc.get("data", {}).get("id")
            print(f"  → [{index}] Processing table: {table_id}")

            # 1. Get columns for this table
            column_docs = self._get_columns_for_table(table_id)

            # 2. Create prompts
            system_prompt = self._create_system_prompt()
            user_prompt = self._create_user_prompt(table_doc, column_docs)

            # 3. Query LLM
            llm_response = await self._query_llm(system_prompt, user_prompt)
            if not llm_response:
                print(f"    ✗ No LLM response for table {table_id}")
                return {"tables": 0, "columns": 0}

            # 4. Parse LLM response
            parsed = self._parse_llm_response(llm_response)
            if not parsed:
                print(f"    ✗ Failed to parse LLM response for table {table_id}")
                return {"tables": 0, "columns": 0}

            table_metadata = parsed.get("table_metadata", {})
            columns_metadata = parsed.get("columns_metadata", [])

            # 5. Update MongoDB documents
            updated_table = self._update_table_document(table_id, table_metadata)
            updated_columns = self._update_column_documents(columns_metadata)

            return {
                "tables": 1 if updated_table else 0,
                "columns": updated_columns
            }

        except Exception as e:
            print(f"    ✗ Error processing table {table_doc.get('data', {}).get('id')}: {str(e)}")
            return {"tables": 0, "columns": 0}
        
        finally:
            del table_doc
            del column_docs
            del system_prompt
            del user_prompt
            del llm_response
            del parsed
            del table_metadata
            del columns_metadata
            gc.collect()  
    
    def process_azure_search_indexing(self):
        """Process Azure AI Search indexing for all documents (Task 2)"""
        if not self.search_endpoint or not self.search_key:
            print(" Azure AI Search credentials not provided. Skipping indexing.")
            return False
        
        print("\n" + "="*60)
        print("TASK 2: Starting Azure AI Search indexing...")
        print("="*60)
        
        # Create search indexes
        print("Creating Azure AI Search indexes...")
        table_index_created = self._create_table_search_index()
        column_index_created = self._create_column_search_index()
        
        if not table_index_created or not column_index_created:
            print(" Failed to create search indexes")
            return False
        
        # Index table documents
        indexed_tables = self._index_table_documents()
        
        # Index column documents
        indexed_columns = self._index_column_documents()
        
        print(f"\n{'='*50}")
        print(f"TASK 2 COMPLETE: Azure AI Search indexing finished!")
        print(f"Tables indexed: {indexed_tables}")
        print(f"Columns indexed: {indexed_columns}")
        print(f"{'='*50}")
        
        return indexed_tables > 0 or indexed_columns > 0
    
    def process_complete_pipeline(self):
        """Execute the complete pipeline: Task 1 (Metadata) -> Task 2 (Indexing)"""
        print("Starting complete metadata processing and indexing pipeline...")
        print("="*80)
        
        # Task 1: Generate metadata using LLM and update MongoDB
        metadata_success = self.process_metadata_generation()
        
        if not metadata_success:
            print(" Task 1 failed. Stopping pipeline.")
            return
        
        # Task 2: Index documents to Azure AI Search
        indexing_success = self.process_azure_search_indexing()
        
        if not indexing_success:
            print(" Task 2 failed, but Task 1 completed successfully.")
            return
        
        print("\n" + "="*80)
        print("🎉 COMPLETE PIPELINE FINISHED SUCCESSFULLY!")
        print(" Task 1: Metadata generation and MongoDB updates - COMPLETED")
        print(" Task 2: Azure AI Search indexing - COMPLETED")
        print("="*80)


    def _calculate_cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        try:
            import numpy as np
            
            if not vec1 or not vec2 or len(vec1) != len(vec2):
                return 0.0
                
            vec1 = np.array(vec1)
            vec2 = np.array(vec2)
            
            # Calculate cosine similarity
            dot_product = np.dot(vec1, vec2)
            norm1 = np.linalg.norm(vec1)
            norm2 = np.linalg.norm(vec2)
            
            if norm1 == 0 or norm2 == 0:
                return 0.0
                
            return float(dot_product / (norm1 * norm2))
            
        except Exception as e:
            print(f"    Error calculating cosine similarity: {str(e)}")
            return 0.0

    def _find_similar_tables(self, target_table_doc: Dict[str, Any], all_tables: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:
        """Find top K most similar tables using embedding vectors"""
        target_embedding = target_table_doc.get('embedding_vector')
        target_id = target_table_doc.get('data', {}).get('id')
        
        if not target_embedding or not target_id:
            return []
        
        similarities = []
        
        for table_doc in all_tables:
            table_data = table_doc.get('data', {})
            table_id = table_data.get('id')
            table_embedding = table_doc.get('embedding_vector')
            
            # Skip same table
            if table_id == target_id:
                continue
                
            if not table_embedding:
                continue
                
            similarity = self._calculate_cosine_similarity(target_embedding, table_embedding)
            if similarity > 0:
                similarities.append({
                    'table_doc': table_doc,
                    'similarity': similarity,
                    'table_id': table_id,
                    'table_label': table_data.get('label', 'Unknown')
                })
        
        # Sort by similarity descending and return top K
        similarities.sort(key=lambda x: x['similarity'], reverse=True)
        return [item['table_doc'] for item in similarities[:top_k]]

    def _find_similar_columns(self, target_table_doc: Dict[str, Any], all_columns: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:
        """Find top K most similar columns using embedding vectors"""
        target_embedding = target_table_doc.get('embedding_vector')
        target_table_id = target_table_doc.get('data', {}).get('id')
        
        if not target_embedding or not target_table_id:
            return []
        
        similarities = []
        
        for column_doc in all_columns:
            column_data = column_doc.get('data', {})
            column_id = column_data.get('id')
            column_embedding = column_doc.get('embedding_vector')
            parent_id = column_data.get('parent_id')
            
            # Skip columns from same table
            if parent_id == target_table_id:
                continue
                
            if not column_embedding:
                continue
                
            similarity = self._calculate_cosine_similarity(target_embedding, column_embedding)
            if similarity > 0:
                similarities.append({
                    'column_doc': column_doc,
                    'similarity': similarity,
                    'column_id': column_id,
                    'column_label': column_data.get('label', 'Unknown'),
                    'parent_id': parent_id
                })
        
        # Sort by similarity descending and return top K
        similarities.sort(key=lambda x: x['similarity'], reverse=True)
        return [item['column_doc'] for item in similarities[:top_k]]
    

    def _get_table_name_by_id(self, table_id: str) -> str:
        """Get table name by table ID"""
        try:
            table_doc = self.table_collection.find_one({"data.id": table_id})
            if table_doc:
                return table_doc.get('data', {}).get('label', table_id)
            return table_id
        except Exception as e:
            print(f"    Error getting table name for ID {table_id}: {str(e)}")
            return table_id


#     def _create_relationship_inference_prompt(self) -> str:
#         """Create system prompt for relationship inference"""
#         return """You are a database relationship expert specializing in inferring foreign key relationships and table references.

# Your task is to analyze a target table and its similar tables/columns to identify potential relationships.

# **CRITICAL REQUIREMENTS:**
# 1. YOU MUST ALWAYS provide a complete, valid JSON response
# 2. YOU MUST NEVER provide incomplete responses or explanations  
# 3. YOU MUST respond with ONLY the JSON structure - no additional text, explanations, or markdown formatting
# 4. Generate relationship inferences based on semantic similarity and structural analysis

# **RESPONSE FORMAT:**
# Respond with ONLY a valid JSON object in exactly this structure (no markdown, no code blocks, no explanations):

# {
#   "foreign_keys_referencing_tables": [
#     {
#       "target_table_name": "<target_table_name>",
#       "linking_column": "<column_name_that_links_tables>",
#       "relation_description": "<concise description with relationship type and business context>"
#     }
#   ],
#   "primary_keys_referencing_tables": [
#     {
#       "to_table": "<referencing_table_name>",
#       "linking_column": "<column_name_that_links_tables>", 
#       "relation_description": "<concise description with relationship type and business context>"
#     }
#   ]
# }

# **RELATIONSHIP INFERENCE GUIDELINES:**

# **For Foreign Keys:**
# - Identify tables that the target table likely references (target table has foreign key pointing to another table)
# - Look for semantic indicators: similar column names, data types, business logic patterns
# - Focus on "belongs to" or "references" relationships
# - Example: "Orders table references Customers table via customer_id"

# **For Referencing Tables:**
# - Identify tables that likely reference the target table (other tables have foreign keys pointing to target table)
# - Look for tables that would logically depend on or link to the target table
# - Focus on "has many" or "is referenced by" relationships  
# - Example: "Orders table is referenced by OrderItems table via order_id"

# **Linking Column Guidelines:**
# - Identify the specific column name that creates the relationship link
# - Look for common naming patterns: id, foreign_key_name, table_name_id
# - Base this on semantic similarity and column name patterns from the provided data
# - If uncertain about exact column name, use the most likely candidate based on naming conventions

# **Relation Description Format:**
# - Start with relationship type (one-to-one, one-to-many, many-to-one, many-to-many)
# - Include business context and purpose
# - Keep descriptions concise (1-2 sentences maximum)
# - Examples:
#   * "One-to-many: Each customer can have multiple orders for tracking purchase history"
#   * "Many-to-one: Multiple products belong to one category for organization"
#   * "One-to-one: Each user has one profile for storing detailed information"

# **IMPORTANT:**
# - Only include relationships with high confidence based on semantic similarity
# - Avoid speculative relationships without clear semantic indicators
# - Each relationship should have a meaningful business justification
# - If no clear relationships are found, return empty arrays

# **REMEMBER:** Respond with ONLY the JSON object. No explanations, no markdown formatting, no code blocks."""


    def _create_relationship_inference_prompt(self) -> str:
        """Load Relationship inference prompt from file""" 
        try:
            with open('prompts/relationship_inference.txt', 'r') as file:
                prompt = file.read().strip()
            return prompt
        except Exception as e:
            print(f"Error loading relationship inference prompt: {str(e)}")
            return "You are a database relationship expert specializing in inferring foreign key relationships and table references. Please analyze the provided data and respond with a valid JSON object containing inferred relationships."
        
    
    # def _create_relationship_user_prompt(self, target_table: Dict[str, Any], similar_tables: List[Dict[str, Any]], similar_columns: List[Dict[str, Any]]) -> str:
    #     """Create user prompt for relationship inference"""
        
    #     target_data = target_table.get('data', {})
    #     target_info = f"""**TARGET TABLE:**
    # - Table ID: {target_data.get('id', 'N/A')}
    # - Table Label: {target_data.get('label', 'N/A')}
    # - Table Type: {target_data.get('type', 'N/A')}
    # - Description: {target_data.get('description', 'N/A')}
    # - Embedding Input: {target_table.get('embedding_input', 'N/A')}
    # - Current Foreign Keys: {target_table.get('foreign_keys_referencing_tables', [])}
    # - Current Referencing Tables: {target_table.get('primary_keys_referencing_tables', [])}"""
        
    #     similar_tables_info = "**SIMILAR TABLES (Top 5):**\n"
    #     for i, table_doc in enumerate(similar_tables, 1):
    #         table_data = table_doc.get('data', {})
    #         similar_tables_info += f"""
    # Table {i}:
    # - Table ID: {table_data.get('id', 'N/A')}
    # - Table Label: {table_data.get('label', 'N/A')}
    # - Table Type: {table_data.get('type', 'N/A')}
    # - Description: {table_data.get('description', 'N/A')}
    # - Embedding Input: {table_doc.get('embedding_input', 'N/A')}"""
        
    #     similar_columns_info = "**SIMILAR COLUMNS (Top 5):**\n"
    #     for i, column_doc in enumerate(similar_columns, 1):
    #         column_data = column_doc.get('data', {})
    #         similar_columns_info += f"""
    # Column {i}:
    # - Column ID: {column_data.get('id', 'N/A')}
    # - Column Label: {column_data.get('label', 'N/A')}
    # - Data Type: {column_data.get('data_type', 'N/A')}
    # - Parent Table ID: {column_data.get('parent_id', 'N/A')}
    # - Description: {column_data.get('description', 'N/A')}
    # - Embedding Input: {column_doc.get('embedding_input', 'N/A')}"""
        
    #     return f"""Analyze the following target table and its semantically similar tables/columns to infer potential relationships:

    # {target_info}

    # {similar_tables_info}

    # {similar_columns_info}

    # **ANALYSIS FOCUS:**
    # 1. **Foreign Key Relationships**: Which of the similar tables does the target table likely reference? Look for semantic patterns that suggest the target table has foreign keys pointing to other tables.

    # 2. **Referencing Relationships**: Which of the similar tables (or tables containing similar columns) likely reference the target table? Look for patterns suggesting other tables have foreign keys pointing to the target table.

    # 3. **Semantic Indicators**: Consider column names, data types, business context, and logical relationships between entities.

    # **Requirements:**
    # - Only suggest relationships with high confidence based on semantic similarity
    # - Provide clear, business-focused relation descriptions
    # - Avoid speculative relationships without semantic justification
    # - Consider the embedding similarity as an indicator of semantic relatedness

    # Respond with ONLY the JSON object - no explanations, no markdown, no code blocks."""

#     def _create_relationship_user_prompt(self, target_table: Dict[str, Any], similar_tables: List[Dict[str, Any]], similar_columns: List[Dict[str, Any]]) -> str:
#         """Create user prompt for relationship inference from file template"""
#             # Generate the dynamic table info sections
#         target_data = target_table.get('data', {})
#         target_info = f"""**TARGET TABLE:**
#     - Table ID: {target_data.get('id', 'N/A')}
#     - Table Label: {target_data.get('label', 'N/A')}
#     - Table Type: {target_data.get('type', 'N/A')}
#     - Description: {target_data.get('description', 'N/A')}
#     - Embedding Input: {target_table.get('embedding_input', 'N/A')}
#     - Current Foreign Keys: {target_table.get('foreign_keys_referencing_tables', [])}
#     - Current Referencing Tables: {target_table.get('primary_keys_referencing_tables', [])}"""
            
#         similar_tables_info = "**SIMILAR TABLES (Top 5):**\n"
#         for i, table_doc in enumerate(similar_tables, 1):
#             table_data = table_doc.get('data', {})
#             similar_tables_info += f"""
#         Table {i}:
#         - Table ID: {table_data.get('id', 'N/A')}
#         - Table Label: {table_data.get('label', 'N/A')}
#         - Table Type: {table_data.get('type', 'N/A')}
#         - Description: {table_data.get('description', 'N/A')}
#         - Embedding Input: {table_doc.get('embedding_input', 'N/A')}"""
            
#             similar_columns_info = "**SIMILAR COLUMNS (Top 5):**\n"
#             for i, column_doc in enumerate(similar_columns, 1):
#                 column_data = column_doc.get('data', {})
#                 similar_columns_info += f"""
#         Column {i}:
#         - Column ID: {column_data.get('id', 'N/A')}
#         - Column Label: {column_data.get('label', 'N/A')}
#         - Data Type: {column_data.get('data_type', 'N/A')}
#         - Parent Table ID: {column_data.get('parent_id', 'N/A')}
#         - Description: {column_data.get('description', 'N/A')}
#         - Embedding Input: {column_doc.get('embedding_input', 'N/A')}

     
#         Analyze the following target table and its semantically similar tables and columns to infer potential relationships:

#         {target_info}

#         {similar_tables_info}

#         {similar_columns_info}

#         ANALYSIS FOCUS:
#         1. Foreign Key Relationships: Identify which tables the target table likely references. Focus on cases where the target table contains a foreign key column pointing to another table’s primary key.

#         2. Referencing Relationships: Identify which tables are likely referencing the target table. These are cases where another table contains a foreign key pointing to the target table’s primary key.

#         3. Semantic Indicators: Use semantic similarity, column names, data types, and logical business context to infer meaningful relationships. Consider embedding similarity as an indicator of relatedness.

#         REQUIREMENTS:
#         - Only suggest relationships with high confidence based on semantic evidence
#         - Provide clear, concise business-focused relation descriptions
#         - Do NOT include speculative or weak relationships
#         - Follow standard naming patterns when identifying linking columns
#         - You MUST return ONLY a valid JSON object in the following format:

#         {
#         "foreign_keys_referencing_tables": [
#             {
#             "target_table_name": "<target_table_name>",
#             "linking_column": "<column_name_that_links_tables>",
#             "relation_description": "<concise description with relationship type and business context>"
#             }
#         ],
#         "primary_keys_referencing_tables": [
#             {
#             "to_table": "<referencing_table_name>",
#             "linking_column": "<column_name_that_links_tables>",
#             "relation_description": "<concise description with relationship type and business context>"
#             }
#         ]
#         }

#         IMPORTANT:
#         - Do NOT include any explanations, markdown, or code blocks
#         - If no relationships are found, return empty arrays for both fields:

#         {
#         "foreign_keys_referencing_tables": [],
#         "primary_keys_referencing_tables": []
#         }"""

#    #     # Load prompt template from file
#         #     with open('prompts/relationship_user_prompt.txt', 'r') as file:
#         #         prompt_template = file.read().strip()

#         #     # Format the template with dynamic content
#         #     formatted_prompt = prompt_template.format(
#         #         target_info=target_info,
#         #         similar_tables_info=similar_tables_info,
#         #         similar_columns_info=similar_columns_info
#         #     )

#         #     return formatted_prompt

#         # except Exception as e:
#         #     print(f"Error loading relationship user prompt template: {str(e)}")
#         #     # Return hardcoded fallback prompt if file loading fails
#         #     return f"""Analyze the following target table and its semantically similar tables/columns...
#         #             {target_info}
#         #             {similar_tables_info}
#         #             {similar_columns_info}"""


    def _create_relationship_user_prompt(self, target_table: Dict[str, Any], similar_tables: List[Dict[str, Any]], similar_columns: List[Dict[str, Any]]) -> str:
            """Create user prompt for relationship inference"""
            
            target_data = target_table.get('data', {})
            target_info = f"""**TARGET TABLE:**
        - Table ID: {target_data.get('id', 'N/A')}
        - Table Label: {target_data.get('label', 'N/A')}
        - Table Type: {target_data.get('type', 'N/A')}
        - Description: {target_data.get('description', 'N/A')}
        - Embedding Input: {target_table.get('embedding_input', 'N/A')}
        - Current Foreign Keys: {target_table.get('foreign_keys_referencing_tables', [])}
        - Current Referencing Tables: {target_table.get('primary_keys_referencing_tables', [])}"""
            
            similar_tables_info = "**SIMILAR TABLES (Top 5):**\n"
            for i, table_doc in enumerate(similar_tables, 1):
                table_data = table_doc.get('data', {})
                similar_tables_info += f"""
        Table {i}:
        - Table ID: {table_data.get('id', 'N/A')}
        - Table Label: {table_data.get('label', 'N/A')}
        - Table Type: {table_data.get('type', 'N/A')}
        - Description: {table_data.get('description', 'N/A')}
        - Embedding Input: {table_doc.get('embedding_input', 'N/A')}"""
            
            similar_columns_info = "**SIMILAR COLUMNS (Top 5):**\n"
            for i, column_doc in enumerate(similar_columns, 1):
                column_data = column_doc.get('data', {})
                similar_columns_info += f"""
        Column {i}:
        - Column ID: {column_data.get('id', 'N/A')}
        - Column Label: {column_data.get('label', 'N/A')}
        - Data Type: {column_data.get('data_type', 'N/A')}
        - Parent Table ID: {column_data.get('parent_id', 'N/A')}
        - Description: {column_data.get('description', 'N/A')}
        - Embedding Input: {column_doc.get('embedding_input', 'N/A')}"""
            
            return f"""Analyze the following target table and its semantically similar tables/columns to infer potential relationships:

        {target_info}

        {similar_tables_info}

        {similar_columns_info}

        **ANALYSIS FOCUS:**
        1. **Foreign Key Relationships**: Which of the similar tables does the target table likely reference? Look for semantic patterns that suggest the target table has foreign keys pointing to other tables.

        2. **Referencing Relationships**: Which of the similar tables (or tables containing similar columns) likely reference the target table? Look for patterns suggesting other tables have foreign keys pointing to the target table.

        3. **Semantic Indicators**: Consider column names, data types, business context, and logical relationships between entities.

        **Requirements:**
        - Only suggest relationships with high confidence based on semantic similarity
        - Provide clear, business-focused relation descriptions
        - Avoid speculative relationships without semantic justification
        - Consider the embedding similarity as an indicator of semantic relatedness

        Respond with ONLY the JSON object - no explanations, no markdown, no code blocks."""


    def _create_user_prompt(self, table_doc: Dict[str, Any], column_docs: List[Dict[str, Any]]) -> str:
        """Create user prompt with table and column information"""
        
        # Extract table information
        table_data = table_doc.get('data', {})
        table_info = f"""**Table Information:**
- Table ID: {table_data.get('id', 'N/A')}
- Table Label: {table_data.get('label', 'N/A')}
- Table Type: {table_data.get('type', 'N/A')}
- Parent Type: {table_data.get('parent_type', 'N/A')}
- Parent ID: {table_data.get('parent_id', 'N/A')}
- Parent Name: {table_data.get('parent_name', 'N/A')}
- Primary Keys: {table_doc.get('primary_keys', [])}
- Foreign Keys (if known): {table_doc.get('foreign_keys_referencing_tables', [])}
- Referencing Tables: {table_doc.get('primary_keys_referencing_tables', [])}"""
        
        # Extract column information
        columns_info = "**Columns Information:**\n"
        for i, col_doc in enumerate(column_docs, 1):
            col_data = col_doc.get('data', {})

            columns_info += f"""
Column {i}:
- Column ID: {col_data.get('id', 'N/A')}
- Column Label: {col_data.get('label', 'N/A')}
- Data Type: {col_data.get('data_type', 'N/A')}
- Nullable: {col_data.get('nullable', 'N/A')}
- Sample Values: {col_doc.get('sample_values', [])}
- Foreign Key Indicators: <LLM to analyze based on name, type, and sample values> """

        return f"""Analyze the following table and column data to generate comprehensive metadata:

{table_info}

{columns_info}

**SPECIAL FOCUS ON FOREIGN KEY DETECTION:**
Look for columns that could be foreign keys by analyzing:
1. Column names ending with '_id', '_key', or containing 'id' 
2. Data types suitable for keys (int, bigint, uuid, varchar with key patterns)
3. Column names that suggest references to other entities
4. Patterns indicating relationships (customer_id, user_id, order_id, etc.)

**Requirements:**
- Generate meaningful descriptions and embedding inputs based on the table and column information
- Create relevant tags for searchability
- CRITICALLY IMPORTANT: Analyze and infer probable foreign key columns for the table
- Use the table structure and column details to infer business context
- Include all column IDs in the response for proper mapping

Respond with ONLY the JSON object - no explanations, no markdown, no code blocks."""

    def _update_table_relationships(self, table_id: str, foreign_keys_referencing_tables: List[Dict[str, Any]], primary_keys_referencing_tables: List[Dict[str, Any]]) -> bool:
        """Update table document with inferred relationships"""
        try:
            # Get current relationships
            current_table = self.table_collection.find_one({"data.id": table_id})
            if not current_table:
                return False
                
            # Convert foreign_keys_referencing_tables to only include column names
            # updated_fks = [fk.get('linking_column', '') for fk in foreign_keys_referencing_tables]

            #keep the full foreign key object instance of just column names
            updated_fks = foreign_keys_referencing_tables
            
            # Convert primary_keys_referencing_tables to the required format
            updated_refs = []
            for ref in primary_keys_referencing_tables:
                updated_refs.append({
                    "to_table": ref.get('to_table', ''),
                    "linking_column": ref.get('linking_column', ''),
                    "relation_description": ref.get('relation_description', '')
                })
            
            # Prepare update document - always update these fields
            update_doc = {
                "$set": {
                    "foreign_keys_referencing_tables": updated_fks,
                    "primary_keys_referencing_tables": updated_refs
                }
            }
            
            # Log the query being built
            table_name = current_table.get('data', {}).get('label', table_id)
            print(f"    Building update query for table: {table_name} (ID: {table_id})")
            print(f"    Query filter: {{'data.id': '{table_id}'}}")
            print(f"    Update operation: {update_doc}")
            print(f"    Foreign keys count: {len(updated_fks)}")
            print(f"    Referencing tables count: {len(updated_refs)}")
            
            result = self.table_collection.update_one(
                {"data.id": table_id},
                update_doc
            )
            
            print(f"    Update result - Modified count: {result.modified_count}, Matched count: {result.matched_count}")
            
            return result.matched_count > 0  # Return true if document was found and processed
            
        except Exception as e:
            print(f"    Error updating relationships for table {table_id}: {str(e)}")
            return False

    def _update_bidirectional_relationships(self, relationships: List[Dict[str, Any]]) -> None:
        """Update bidirectional relationships for all affected tables"""
        try:
            for relationship in relationships:
                relationship_type = relationship.get('type')  # 'foreign_key' or 'referencing'
                source_table_name = relationship.get('source_table_name')
                target_table_name = relationship.get('target_table_name') 
                linking_column = relationship.get('linking_column', '')
                relation_description = relationship.get('relation_description', '')
                
                if relationship_type == 'foreign_key':
                    # Update the target table's primary_keys_referencing_tables
                    target_table = self.table_collection.find_one({"data.label": target_table_name})
                    if target_table:
                        current_refs = target_table.get('primary_keys_referencing_tables', [])
                        # Check if this reverse relationship already exists
                        if not any(ref.get('to_table') == source_table_name for ref in current_refs):
                            # Create reverse relationship description
                            reverse_description = f"Referenced by {source_table_name}: {relation_description}"
                            new_ref = {
                                'to_table': source_table_name,
                                'linking_column': linking_column,
                                'relation_description': reverse_description
                            }
                            current_refs.append(new_ref)
                            
                            # Log the bidirectional update query
                            target_id = target_table.get('data', {}).get('id', '')
                            print(f"    Bidirectional update for table: {target_table_name} (ID: {target_id})")
                            print(f"    Adding referencing table: {new_ref}")
                            
                            self.table_collection.update_one(
                                {"data.label": target_table_name},
                                {"$set": {"primary_keys_referencing_tables": current_refs}}
                            )
                
                elif relationship_type == 'referencing':
                    # Update the source table's foreign_keys_referencing_tables
                    source_table = self.table_collection.find_one({"data.label": source_table_name})
                    if source_table:
                        current_fks = source_table.get('foreign_keys_referencing_tables', [])
                        current_table_name = relationship.get('current_table_name')
                        # Check if this reverse relationship already exists
                        if not any(fk.get('target_table_name') == current_table_name for fk in current_fks):
                            # Create reverse relationship description
                            reverse_description = f"References {current_table_name}: {relation_description}"
                            new_fk = {
                                'target_table_name': current_table_name,
                                'linking_column': linking_column,
                                'relation_description': reverse_description
                            }
                            current_fks.append(new_fk)
                            
                            # Log the bidirectional update query
                            source_id = source_table.get('data', {}).get('id', '')
                            print(f"    Bidirectional update for table: {source_table_name} (ID: {source_id})")
                            print(f"    Adding foreign key: {new_fk}")
                            
                            self.table_collection.update_one(
                                {"data.label": source_table_name},
                                {"$set": {"foreign_keys_referencing_tables": current_fks}}
                            )
                            
        except Exception as e:
            print(f"    Error updating bidirectional relationships: {str(e)}")

                
    async def process_relationship_inference(self):
        """Process relationship inference for all tables (Task 3)"""
        print("\n" + "="*60)
        print("TASK 3: Starting relationship inference...")
        print("="*60)
        
        # Get all table and column documents with embeddings
        print("Loading all table and column documents...")
        all_tables = [doc for doc in self._get_all_table_documents() if doc.get('embedding_vector')]
        all_columns = [doc for doc in self._get_all_column_documents() if doc.get('embedding_vector')]
        
        if not all_tables:
            print("No tables with embeddings found for relationship inference")
            return False
        
        print(f"Found {len(all_tables)} tables and {len(all_columns)} columns with embeddings")
        
        total_tables = len(all_tables)
        processed_tables = 0
        total_relationships_added = 0
        all_bidirectional_updates = []
        
        for idx, target_table in enumerate(all_tables, 1):
            target_data = target_table.get('data', {})
            table_id = target_data.get('id')
            table_name = target_data.get('label', 'Unknown')
            
            print(f"\nProcessing table {idx}/{total_tables}: {table_name} (ID: {table_id})")
            
            # Find similar tables and columns
            print(f"  Finding similar tables and columns...")

            # Log the query for similar tables
            print(f"  Querying MongoDB for similar tables (Top 5)...")
            similar_tables_query = {"embedding_vector": {"$exists": True}}
            print(f"  MongoDB Query for similar tables: {similar_tables_query}")
            similar_tables = self._find_similar_tables(target_table, all_tables, top_k=5)

            # Log the query for similar columns
            print(f"  Querying MongoDB for similar columns (Top 5)...")
            similar_columns_query = {"embedding_vector": {"$exists": True}}
            print(f"  MongoDB Query for similar columns: {similar_columns_query}")
            similar_columns = self._find_similar_columns(target_table, all_columns, top_k=5)

            
            
            if not similar_tables and not similar_columns:
                print(f"  No similar entities found for table {table_id}")
                continue
            
            # Query LLM for relationship inference
            print(f"  Querying LLM for relationship inference...")
            user_prompt = self._create_relationship_user_prompt(target_table, similar_tables, similar_columns)
            # print(f"  User prompt created for table {table_id}:\n{user_prompt}\n")
            llm_response = await self._query_llm(self._create_relationship_inference_prompt(), user_prompt)
            print(f" LLM response received for table {llm_response}")
            
            if not llm_response:
                print(f"  Failed to get LLM response for table {table_id}")
                continue
            
            # Parse LLM response
            parsed_relationships = self._parse_llm_response(llm_response)
            
            if not parsed_relationships:
                print(f"  Failed to parse LLM response for table {table_id}")
                continue
            
            # Extract relationships
            foreign_keys_referencing_tables = parsed_relationships.get("foreign_keys_referencing_tables", [])
            primary_keys_referencing_tables = parsed_relationships.get("primary_keys_referencing_tables", [])
            
            # Update table relationships
            success = self._update_table_relationships(table_id, foreign_keys_referencing_tables, primary_keys_referencing_tables)
            if success:
                processed_tables += 1
                relationships_count = len(foreign_keys_referencing_tables) + len(primary_keys_referencing_tables)
                total_relationships_added += relationships_count
                print(f"   Updated {relationships_count} relationships for table {table_name}")
                
                # Prepare bidirectional updates
                for fk in foreign_keys_referencing_tables:
                    all_bidirectional_updates.append({
                        'type': 'foreign_key',
                        'source_table_name': table_name,
                        'target_table_name': fk.get('target_table_name'),
                        'linking_column': fk.get('linking_column', ''),
                        'relation_description': fk.get('relation_description', '')
                    })
                
                for ref in primary_keys_referencing_tables:
                    all_bidirectional_updates.append({
                        'type': 'referencing',
                        'source_table_name': ref.get('to_table'),
                        'current_table_name': table_name,
                        'linking_column': ref.get('linking_column', ''),
                        'relation_description': ref.get('relation_description', '')
                    })
            else:
                print(f"   Failed to update relationships for table {table_name}")
        
        # Process bidirectional updates
        if all_bidirectional_updates:
            print(f"\nProcessing {len(all_bidirectional_updates)} bidirectional relationship updates...")
            self._update_bidirectional_relationships(all_bidirectional_updates)
            print(" Bidirectional relationships updated")
        
        print(f"\n{'='*50}")
        print(f"TASK 3 COMPLETE: Relationship inference finished!")
        print(f"Tables processed: {processed_tables}/{total_tables}")
        print(f"Total relationships added: {total_relationships_added}")
        print(f"{'='*50}")
        
        return processed_tables > 0

async def run_mongodb_metadata_task():
    """Task 1: Run MongoDB metadata generation only"""
    print("Starting MongoDB Metadata Generation Task...")
    print("="*60)
    
    config = Config()
    
    with MongoDBMetadataProcessor(config) as processor:
        success = await processor.process_metadata_generation()
        if success:
            print("MongoDB metadata task completed successfully!")
        else:
            print("MongoDB metadata task failed!")
        return success


def run_azure_search_task():
    """Task 2: Run Azure AI Search indexing only"""
    print("Starting Azure Search Indexing Task...")
    print("="*60)
    
    config = Config()
    
    if not config.SEARCH_ENDPOINT or not config.SEARCH_KEY:
        print("Azure AI Search credentials not provided. Please set AZURE_SEARCH_ENDPOINT and AZURE_SEARCH_ADMIN_KEY environment variables.")
        return False
    
    with MongoDBMetadataProcessor(config) as processor:
        success = processor.process_azure_search_indexing()
        if success:
            print("Azure Search indexing task completed successfully!")
        else:
            print("Azure Search indexing task failed!")
        return success

async def run_relationship_inference_task():
    """Task 3: Run relationship inference only"""
    print("Starting Relationship Inference Task...")
    print("="*60)
    
    config = Config()
    
    processor = MongoDBMetadataProcessor(config)
    
    try:
        success = await processor.process_relationship_inference()
        # success = processor.process_relationship_inference()
        if success:
            print("Relationship inference task completed successfully!")
        else:
            print("Relationship inference task failed!")
        return success
    finally:
        processor.client.close()

async def main(): 
    print("MongoDB Metadata Processor")
    print("="*80)
    
    # Task 1: MongoDB Metadata Generation (REQUIRED)
    mongodb_success = await run_mongodb_metadata_task()
    
    if not mongodb_success:
        print("\nTask 1 failed. Stopping pipeline - Task 1 is required for subsequent tasks.")
        print("="*80)
        exit(1)
    
    print("\n")
    
    # Task 2: Azure Search Indexing (OPTIONAL)
    azure_success = run_azure_search_task()
    
    print("\n")
    
    # Task 3: Relationship Inference (RUNS if Task 1 succeeded, regardless of Task 2)
    relationship_success = await run_relationship_inference_task()
    
    print("\n" + "="*80)
    print("PIPELINE EXECUTION SUMMARY:")
    print(f"Task 1 (Metadata Generation): {' SUCCESS' if mongodb_success else ' FAILED'}")
    print(f"Task 2 (Azure Search Indexing): {' SUCCESS' if azure_success else ' FAILED/SKIPPED'}")
    print(f"Task 3 (Relationship Inference): {' SUCCESS' if relationship_success else ' FAILED'}")
    
    if mongodb_success and relationship_success:
        if azure_success:
            print("\nALL TASKS COMPLETED SUCCESSFULLY!")
        else:
            print("\nCore tasks completed successfully (Azure Search optional task failed/skipped)")
    else:
        print("\nSome tasks failed - check logs above")
    print("="*80)
    
    
if __name__ == "__main__":
    asyncio.run(main())
```



# Jul-23 Backup

```python
import json
import os
from datetime import datetime
from typing import Dict, List, Any, Optional
from langchain_openai import AzureChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from pymongo import MongoClient
from pymongo.database import Database
from pymongo.collection import Collection
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchIndex,
    SearchField,
    SearchFieldDataType,
    SimpleField,
    SearchableField,
    ComplexField
)
from azure.core.credentials import AzureKeyCredential
from dotenv import load_dotenv
import asyncio
import time
import gc

load_dotenv()

# Configuration - Externalized settings
class Config:
    # MongoDB Configuration
    MONGO_CONNECTION_STRING = os.getenv("MONGO_CONNECTION_STRING", "mongodb://localhost:27017/")
    DATABASE_NAME = os.getenv("DATABASE_NAME", "COC")
    TABLE_COLLECTION_NAME = os.getenv("TABLE_COLLECTION_NAME", "table_metadata")
    COLUMN_COLLECTION_NAME = os.getenv("COLUMN_COLLECTION_NAME", "column_metadata")
    
    # Azure AI Search Configuration
    SEARCH_ENDPOINT = os.getenv("AZURE_SEARCH_ENDPOINT")
    SEARCH_KEY = os.getenv("AZURE_SEARCH_ADMIN_KEY")
    TABLE_SEARCH_INDEX = os.getenv("TABLE_SEARCH_INDEX", "table_metadata_index")
    COLUMN_SEARCH_INDEX = os.getenv("COLUMN_SEARCH_INDEX", "column_metadata_index")
    
    # Azure OpenAI Configuration
    INFERENCE_MODEL = os.getenv("INFERENCE_MODEL", "gpt-4o-mini")
    OPENAI_API_VERSION = os.getenv("OPENAI_API_VERSION", "2023-12-01-preview")
    OPENAI_API_URL = os.getenv("OPENAI_API_URL")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

    # Azure OpenAI Embeddings Configuration
    EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-ada-002")
    EMBEDDING_DIMENSIONS = int(os.getenv("EMBEDDING_DIMENSIONS", "3072"))

class MongoDBMetadataProcessor:
    def __init__(self, config: Config = None):
        """
        Initialize the processor with externalized configuration
        
        Args:
            config: Configuration object containing all settings
        """
        self.config = config or Config()
        
        # Initialize MongoDB connection
        self.client = MongoClient(self.config.MONGO_CONNECTION_STRING)
        self.db: Database = self.client[self.config.DATABASE_NAME]
        self.table_collection: Collection = self.db[self.config.TABLE_COLLECTION_NAME]
        self.column_collection: Collection = self.db[self.config.COLUMN_COLLECTION_NAME]
        
        # Add these missing attributes
        self.search_endpoint = self.config.SEARCH_ENDPOINT
        self.search_key = self.config.SEARCH_KEY

        # Initialize Azure AI Search clients if credentials provided
        self.search_credential = None
        self.search_index_client = None
        self.table_search_client = None
        self.column_search_client = None
        
        if self.search_endpoint and self.search_key:
            self.search_credential = AzureKeyCredential(self.search_key)
            self.search_index_client = SearchIndexClient(
                endpoint=self.search_endpoint,
                credential=self.search_credential
            )
        
        # Initialize Azure OpenAI LLM
        self.llm = AzureChatOpenAI(
            azure_deployment=self.config.INFERENCE_MODEL,
            openai_api_version=self.config.OPENAI_API_VERSION,
            azure_endpoint=self.config.OPENAI_API_URL,
            api_key=self.config.OPENAI_API_KEY,
            temperature=0
        )

        # Initialize Azure OpenAI Embeddings client
        self.embedding_llm = AzureChatOpenAI(
            azure_deployment=self.config.EMBEDDING_MODEL,
            openai_api_version=self.config.OPENAI_API_VERSION,
            azure_endpoint=self.config.OPENAI_API_URL,
            api_key=self.config.OPENAI_API_KEY,
            temperature=0
        )
        
        print(f"Connected to MongoDB database: {self.config.DATABASE_NAME}")
        print(f"Table collection: {self.table_collection.count_documents({})}")
        print(f"Column collection: {self.column_collection.count_documents({})}")
        
        if self.config.SEARCH_ENDPOINT:
            print(f"Azure AI Search endpoint configured: {self.config.SEARCH_ENDPOINT}")
        
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Close MongoDB connection when exiting context"""
        self.client.close()
    
    def _get_table_documents_batch(self, skip: int, limit: int = 4) -> List[Dict[str, Any]]:
        """Retrieve a batch of table documents from MongoDB using pagination"""
        try:
            cursor = self.table_collection.find({}).skip(skip).limit(limit)
            tables = list(cursor)
            print(f"  Retrieved {len(tables)} tables from {skip} to {skip + len(tables)}")
            return tables
        except Exception as e:
            print(f"Error retrieving batch of table documents: {str(e)}")
            return []
    
    def _get_total_table_count(self) -> int:
        """Get total number of table documents"""
        try:
            return self.table_collection.count_documents({})
        except Exception as e:
            print(f"Error counting table documents: {str(e)}")
            return 0
        
        
    def _get_all_table_documents(self) -> List[Dict[str, Any]]:
        """Retrieve all documents from table_metadata collection"""
        try:
            cursor = self.table_collection.find({})
            tables = list(cursor)
            print(f"Retrieved {len(tables)} table documents from MongoDB")
            print(f"Printing Retrieved Table Documents: {tables}")
            return tables
        except Exception as e:
            print(f"Error retrieving table documents: {str(e)}")
            return []
    
    def _get_all_column_documents(self) -> List[Dict[str, Any]]:
        """Retrieve all documents from column_metadata collection"""
        try:
            cursor = self.column_collection.find({})
            columns = list(cursor)
            print(f"Retrieved {len(columns)} column documents from MongoDB")
            print(f"Printing Retrieved Column Documents: {columns}")
            return columns
        except Exception as e:
            print(f"Error retrieving column documents: {str(e)}")
            return []
    
    def _get_columns_for_table(self, table_id: str) -> List[Dict[str, Any]]:
        """Retrieve all column documents for a specific table ID"""
        try:
            cursor = self.column_collection.find({"data.parent_id": table_id})
            columns = list(cursor)
            print(f"  Retrieved {len(columns)} column documents for table ID: {table_id}")
            return columns
        except Exception as e:
            print(f"  Error retrieving column documents for table {table_id}: {str(e)}")
            return []
    
    def _create_system_prompt(self) -> str:
        """Create system prompt for LLM processing"""
        return """You are a data analyst expert specializing in creating comprehensive metadata for database tables and columns.

Your task is to analyze table and column information and generate detailed metadata for the specified fields only.

**CRITICAL REQUIREMENTS:**
1. YOU MUST ALWAYS provide a complete, valid JSON response
2. YOU MUST NEVER provide incomplete responses or explanations  
3. YOU MUST respond with ONLY the JSON structure - no additional text, explanations, or markdown formatting
4. Generate metadata for ONLY the requested fields: description, embedding_input, tags, and foreign_keys_referencing_tables

**RESPONSE FORMAT:**
Respond with ONLY a valid JSON object in exactly this structure (no markdown, no code blocks, no explanations):

{
  "table_metadata": {
    "description": "<concise_description_for_UI>",
    "embedding_input": "<detailed_description_for_embedding>", 
    "tags": ["<tag1>", "<tag2>", "<tag3>"],
    "foreign_keys_referencing_tables": ["<column_name1>", "<column_name2>"]
  },
  "columns_metadata": [
    {
      "column_id": "<column_id>",
      "description": "<concise_description_for_UI>",
      "embedding_input": "<detailed_description_for_embedding>",
      "tags": ["<tag1>", "<tag2>", "<tag3>"]
    }
  ]
}

**FIELD GUIDELINES:**

**For Table:**
- **description**: Concise description (1 sentence) suitable for UI rendering
- **embedding_input**: For embedding purposes, the table-level description should be comprehensive, covering the business description, technical structure, and intended purpose of the table. It should explain what the table represents, how it supports key business processes, and the nature of the data it stores. The description must also detail the table's structure, such as how it is organized, key identifiers, and any important constraints. Including synonyms or alternate names helps improve semantic understanding during embedding.
- **tags**: Provide 1-3 relevant tags for searchability
- **foreign_keys_referencing_tables**: CRITICAL - Infer which columns are likely to serve as foreign keys by understanding their semantic meaning and relational intent. Focus on identifying columns that are likely referencing other tables, typically serving as links between related entities. Consider the following signals (not strict rules):
    * Column names that suggest relationships (e.g., include terms like "id", "key", or entity names)
    * Data types commonly used for identifiers (e.g., integer, UUID, string)
    * Naming patterns or semantic clues that imply linkage to another table
    * Columns that are contextually significant for joining records across entities
    * Return an array of column names (not IDs) that are most likely acting as foreign keys based on their meaning and role in relational structure.

**For Columns:**
- **column_id**: Use the exact column ID from input
- **description**: Concise description (1 sentence) suitable for UI rendering  
- **embedding_input**: For embedding purposes, each column must have a detailed and enriched description that captures its data type, applicable constraints (e.g., primary key, nullable, unique), and its functional purpose within the table. The description should clearly explain what the column represents, how it is used in business or technical workflows, and why it is important. Additionally, include any relevant synonyms or alternate labels to enhance semantic understanding and support more effective retrieval during search.
- **tags**: Provide 1-3 relevant tags for searchability

**REMEMBER:** Respond with ONLY the JSON object. No explanations, no markdown formatting, no code blocks."""
    
    def _create_user_prompt(self, table_doc: Dict[str, Any], column_docs: List[Dict[str, Any]]) -> str:
        """Create user prompt with table and column information"""
        
        # Extract table information
        table_data = table_doc.get('data', {})
        table_info = f"""**Table Information:**
- Table ID: {table_data.get('id', 'N/A')}
- Table Label: {table_data.get('label', 'N/A')}
- Table Type: {table_data.get('type', 'N/A')}
- Parent Type: {table_data.get('parent_type', 'N/A')}
- Parent ID: {table_data.get('parent_id', 'N/A')}
- Parent Name: {table_data.get('parent_name', 'N/A')}
- Primary Keys: {table_doc.get('primary_keys', [])}
- Foreign Keys (if known): {table_doc.get('foreign_keys_referencing_tables', [])}
- Referencing Tables: {table_doc.get('primary_keys_referencing_tables', [])}"""
        
        # Extract column information
        columns_info = "**Columns Information:**\n"
        for i, col_doc in enumerate(column_docs, 1):
            col_data = col_doc.get('data', {})

            columns_info += f"""
Column {i}:
- Column ID: {col_data.get('id', 'N/A')}
- Column Label: {col_data.get('label', 'N/A')}
- Data Type: {col_data.get('data_type', 'N/A')}
- Nullable: {col_data.get('nullable', 'N/A')}
- Sample Values: {col_doc.get('sample_values', [])}
- Foreign Key Indicators: <LLM to analyze based on name, type, and sample values> """

        return f"""Analyze the following table and column data to generate comprehensive metadata:

{table_info}

{columns_info}

**SPECIAL FOCUS ON FOREIGN KEY DETECTION:**
Look for columns that could be foreign keys by analyzing:
1. Column names ending with '_id', '_key', or containing 'id' 
2. Data types suitable for keys (int, bigint, uuid, varchar with key patterns)
3. Column names that suggest references to other entities
4. Patterns indicating relationships (customer_id, user_id, order_id, etc.)

**Requirements:**
- Generate meaningful descriptions and embedding inputs based on the table and column information
- Create relevant tags for searchability
- CRITICALLY IMPORTANT: Analyze and infer probable foreign key columns for the table
- Use the table structure and column details to infer business context
- Include all column IDs in the response for proper mapping

Respond with ONLY the JSON object - no explanations, no markdown, no code blocks."""

    
    async def _query_llm(self, system_prompt: str, user_prompt: str) -> Optional[str]:
        """Asynchronously query the LLM with the given prompts"""
        try:
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt)
            ]
            
            response = await self.llm.ainvoke(messages)
            return response.content
        except Exception as e:
            print(f"    Error querying LLM: {str(e)}")
            return None
    
    def _parse_llm_response(self, response: str) -> Optional[Dict[str, Any]]:
        """Parse LLM response to extract the metadata JSON"""
        try:
            # Clean the response - remove any markdown formatting
            clean_response = response.strip()
            
            # Remove code block markers if present
            if clean_response.startswith('```'):
                lines = clean_response.split('\n')
                if lines[0].strip() in ['```json', '```']:
                    lines = lines[1:]
                if lines and lines[-1].strip() == '```':
                    lines = lines[:-1]
                clean_response = '\n'.join(lines)
            
            # Try to find JSON object boundaries
            start_idx = clean_response.find('{')
            if start_idx == -1:
                print("    No JSON object found in response")
                return None
            
            # Find the matching closing brace
            brace_count = 0
            end_idx = -1
            for i in range(start_idx, len(clean_response)):
                if clean_response[i] == '{':
                    brace_count += 1
                elif clean_response[i] == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        end_idx = i
                        break
            
            if end_idx == -1:
                print("    Could not find matching closing brace")
                return None
            
            json_str = clean_response[start_idx:end_idx+1]
            
            # Parse JSON string
            metadata_json = json.loads(json_str)
            
            return metadata_json
            
        except json.JSONDecodeError as e:
            print(f"    JSON decode error: {str(e)}")
            return None
        except Exception as e:
            print(f"    Error parsing LLM response: {str(e)}")
            return None
    
    def _generate_embedding(self, text: str) -> Optional[List[float]]:
        """Generate embedding for given text using Azure OpenAI"""
        try:
            if not text or not text.strip():
                return None
            
            # Use Azure OpenAI embeddings API
            from openai import AzureOpenAI
            
            client = AzureOpenAI(
                api_key=self.config.OPENAI_API_KEY,
                api_version=self.config.OPENAI_API_VERSION,
                azure_endpoint=self.config.OPENAI_API_URL
            )
            
            response = client.embeddings.create(
                input=text.strip(),
                model=self.config.EMBEDDING_MODEL
            )
            
            embedding = response.data[0].embedding
            return embedding
            
        except Exception as e:
            print(f"    Error generating embedding: {str(e)}")
            return None



    def _update_table_document(self, table_id: str, table_metadata: Dict[str, Any]) -> bool:
        """Update table document in MongoDB with generated metadata and embedding"""
        try:
            # Generate embedding for embedding_input
            embedding_input = table_metadata.get("embedding_input", "")
            embedding_vector = None
            
            if embedding_input and embedding_input.strip():
                print(f"      Generating embedding for table {table_id}...")
                embedding_vector = self._generate_embedding(embedding_input)
                if embedding_vector:
                    print(f"       Generated embedding ({len(embedding_vector)} dimensions)")
                else:
                    print(f"       Failed to generate embedding")
            
            update_doc = {
                "$set": {
                    "data.description": table_metadata.get("description", ""),
                    "embedding_input": embedding_input,
                    "embedding_vector": embedding_vector,  # Add embedding vector
                    "tags": table_metadata.get("tags", []),
                    "foreign_keys_referencing_tables": table_metadata.get("foreign_keys_referencing_tables", []),
                    "last_updated_by": "user_ai",
                    "updated_at": datetime.utcnow().isoformat() + "Z"
                }
            }
            
            result = self.table_collection.update_one(
                {"data.id": table_id},
                update_doc
            )
            
            if result.modified_count > 0:
                print(f"     Updated table document for ID: {table_id}")
                # Print foreign keys if found
                foreign_keys_referencing_tables = table_metadata.get("foreign_keys_referencing_tables", [])
                if foreign_keys_referencing_tables:
                    print(f"      Inferred foreign keys: {foreign_keys_referencing_tables}")
                return True
            else:
                print(f"     No table document updated for ID: {table_id}")
                return False
                
        except Exception as e:
            print(f"     Error updating table document {table_id}: {str(e)}")
            return False

    def _update_column_documents(self, columns_metadata: List[Dict[str, Any]]) -> int:
        """Update column documents in MongoDB with generated metadata and embeddings"""
        updated_count = 0
        
        for col_metadata in columns_metadata:
            try:
                column_id = col_metadata.get("column_id")
                if not column_id:
                    print(f"       No column_id found in metadata")
                    continue
                
                # Generate embedding for embedding_input
                embedding_input = col_metadata.get("embedding_input", "")
                embedding_vector = None
                
                if embedding_input and embedding_input.strip():
                    print(f"        Generating embedding for column {column_id}...")
                    embedding_vector = self._generate_embedding(embedding_input)
                    if embedding_vector:
                        print(f"         Generated embedding ({len(embedding_vector)} dimensions)")
                    else:
                        print(f"         Failed to generate embedding")
                
                update_doc = {
                    "$set": {
                        "data.description": col_metadata.get("description", ""),
                        "embedding_input": embedding_input,
                        "embedding_vector": embedding_vector,  # Add embedding vector
                        "tags": col_metadata.get("tags", []),
                        "last_updated_by": "user_ai",
                        "updated_at": datetime.utcnow().isoformat() + "Z"
                    }
                }
                
                result = self.column_collection.update_one(
                    {"data.id": column_id},
                    update_doc
                )
                
                if result.modified_count > 0:
                    print(f"       Updated column document for ID: {column_id}")
                    updated_count += 1
                else:
                    print(f"       No column document updated for ID: {column_id}")
                    
            except Exception as e:
                print(f"       Error updating column document {column_id}: {str(e)}")
        
        return updated_count
        
    def _create_table_search_index(self) -> bool:
        """Create Azure AI Search index for tables with vector field"""
        try:
            fields = [
                SimpleField(name="id", type=SearchFieldDataType.String, key=True),
                SearchableField(name="label", type=SearchFieldDataType.String),
                SearchableField(name="type", type=SearchFieldDataType.String),
                SearchableField(name="parent_type", type=SearchFieldDataType.String),
                SimpleField(name="parent_id", type=SearchFieldDataType.String),
                SearchableField(name="parent_name", type=SearchFieldDataType.String),
                SearchableField(name="description", type=SearchFieldDataType.String),
                SearchableField(name="embedding_input", type=SearchFieldDataType.String),
                # Add vector field for embeddings
                SearchField(
                    name="embedding_vector",
                    type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
                    searchable=True,
                    vector_search_dimensions=self.config.EMBEDDING_DIMENSIONS,
                    vector_search_profile_name="default"
                ),
                SearchableField(name="tags", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
                SimpleField(name="primary_keys", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
                SimpleField(name="foreign_keys_referencing_tables", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
                SimpleField(name="primary_keys_referencing_tables", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
                SimpleField(name="created_by", type=SearchFieldDataType.String),
                SimpleField(name="created_at", type=SearchFieldDataType.DateTimeOffset),
                SimpleField(name="last_updated_by", type=SearchFieldDataType.String),
                SimpleField(name="updated_at", type=SearchFieldDataType.DateTimeOffset),
                ComplexField(name="human_feedback", fields=[
                    SimpleField(name="user", type=SearchFieldDataType.String),
                    SearchableField(name="comment", type=SearchFieldDataType.String),
                    SimpleField(name="timestamp", type=SearchFieldDataType.String)
                ])
            ]
            
            # Configure vector search
            from azure.search.documents.indexes.models import (
                VectorSearch, HnswAlgorithmConfiguration, VectorSearchProfile, SemanticConfiguration
            )
            
            vector_search = VectorSearch(
                algorithms=[
                    HnswAlgorithmConfiguration(
                        name="default-hnsw",
                        parameters={
                            "m": 4,
                            "efConstruction": 400,
                            "efSearch": 500,
                            "metric": "cosine"
                        }
                    )
                ],
                profiles=[
                    VectorSearchProfile(
                        name="default",
                        algorithm_configuration_name="default-hnsw"
                    )
                ]
            )
            
            index = SearchIndex(
                name=self.config.TABLE_SEARCH_INDEX, 
                fields=fields,
                vector_search=vector_search
            )
        
            # Create or update the index
            result = self.search_index_client.create_or_update_index(index)
            print(f" Created/Updated table search index with vector support: {self.config.TABLE_SEARCH_INDEX}")
            
            # Initialize search client for tables
            self.table_search_client = SearchClient(
                endpoint=self.config.SEARCH_ENDPOINT,
                index_name=self.config.TABLE_SEARCH_INDEX,
                credential=self.search_credential
            )
            
            return True
            
        except Exception as e:
            print(f" Error creating table search index: {str(e)}")
            return False

    def _create_column_search_index(self) -> bool:
        """Create Azure AI Search index for columns with vector field"""
        try:
            fields = [
                SimpleField(name="id", type=SearchFieldDataType.String, key=True),
                SearchableField(name="label", type=SearchFieldDataType.String),
                SearchableField(name="data_type", type=SearchFieldDataType.String),
                SimpleField(name="nullable", type=SearchFieldDataType.Boolean),
                SimpleField(name="parent_id", type=SearchFieldDataType.String),
                SearchableField(name="parent_name", type=SearchFieldDataType.String),
                SearchableField(name="parent_type", type=SearchFieldDataType.String),
                SearchableField(name="description", type=SearchFieldDataType.String),
                SearchableField(name="embedding_input", type=SearchFieldDataType.String),
                # Add vector field for embeddings
                SearchField(
                    name="embedding_vector",
                    type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
                    searchable=True,
                    vector_search_dimensions=self.config.EMBEDDING_DIMENSIONS,
                    vector_search_profile_name="default"
                ),
                SearchableField(name="tags", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
                SimpleField(name="sample_values", type=SearchFieldDataType.Collection(SearchFieldDataType.String)),
                SimpleField(name="created_by", type=SearchFieldDataType.String),
                SimpleField(name="created_at", type=SearchFieldDataType.DateTimeOffset),
                SimpleField(name="last_updated_by", type=SearchFieldDataType.String),
                SimpleField(name="updated_at", type=SearchFieldDataType.DateTimeOffset),
                ComplexField(name="human_feedback", fields=[
                    SimpleField(name="user", type=SearchFieldDataType.String),
                    SearchableField(name="comment", type=SearchFieldDataType.String),
                    SimpleField(name="timestamp", type=SearchFieldDataType.String)
                ])
            ]
            
            # Configure vector search (same as tables)
            from azure.search.documents.indexes.models import (
                VectorSearch, HnswAlgorithmConfiguration, VectorSearchProfile
            )
            
            vector_search = VectorSearch(
                algorithms=[
                    HnswAlgorithmConfiguration(
                        name="default-hnsw",
                        parameters={
                            "m": 4,
                            "efConstruction": 400,
                            "efSearch": 500,
                            "metric": "cosine"
                        }
                    )
                ],
                profiles=[
                    VectorSearchProfile(
                        name="default",
                        algorithm_configuration_name="default-hnsw"
                    )
                ]
            )
            
            index = SearchIndex(
                name=self.config.COLUMN_SEARCH_INDEX, 
                fields=fields,
                vector_search=vector_search
            )
        
            # Create or update the index
            result = self.search_index_client.create_or_update_index(index)
            print(f" Created/Updated column search index with vector support: {self.config.COLUMN_SEARCH_INDEX}")
            
            # Initialize search client for columns
            self.column_search_client = SearchClient(
                endpoint=self.config.SEARCH_ENDPOINT,
                index_name=self.config.COLUMN_SEARCH_INDEX,
                credential=self.search_credential
            )
            
            return True
            
        except Exception as e:
            print(f" Error creating column search index: {str(e)}")
            return False
    
    def _prepare_table_document_for_search(self, table_doc: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare table document for Azure AI Search indexing"""
        table_data = table_doc.get('data', {})
        
        # Check if embedding_input is empty - skip if so
        embedding_input = str(table_doc.get('embedding_input', '')).strip()
        if not embedding_input:
            return None  # Signal to skip this document
        
        def safe_datetime(value):
            """Safely convert datetime string to proper format"""
            if isinstance(value, str) and value.strip():
                try:
                    # Ensure the datetime string ends with Z for UTC
                    if not value.endswith('Z'):
                        return value + 'Z' if 'T' in value else value
                    return value
                except:
                    return datetime.utcnow().isoformat() + "Z"
            return datetime.utcnow().isoformat() + "Z"
        
        def clean_human_feedback(feedback_list):
            """Clean human feedback array to remove empty objects"""
            if not isinstance(feedback_list, list):
                return []
            
            cleaned_feedback = []
            for feedback in feedback_list:
                if isinstance(feedback, dict):
                    user = str(feedback.get('user', '')).strip()
                    comment = str(feedback.get('comment', '')).strip()
                    timestamp = str(feedback.get('timestamp', '')).strip()
                    
                    cleaned_feedback.append({
                        "user": user,
                        "comment": comment,
                        "timestamp": timestamp
                    })
            
            return cleaned_feedback
        
        def safe_list(value):
            """Safely convert value to list"""
            if isinstance(value, list):
                return [str(item) if item is not None else "" for item in value]
            return []
        
        def safe_string(value):
            """Safely convert value to string"""
            return str(value) if value is not None else ""
        
        # Prepare the complete document - DO NOT include embedding_vector from MongoDB
        search_doc = {
            "id": safe_string(table_data.get('id', '')),
            "label": safe_string(table_data.get('label', '')),
            "type": safe_string(table_data.get('type', '')),
            "parent_type": safe_string(table_data.get('parent_type', '')),
            "parent_id": safe_string(table_data.get('parent_id', '')),
            "parent_name": safe_string(table_data.get('parent_name', '')),
            "description": safe_string(table_data.get('description', '')),
            "embedding_input": embedding_input,  # This will be embedded by Azure AI Search
            # Note: embedding_vector will be auto-generated by Azure AI Search from embedding_input
            "tags": safe_list(table_doc.get('tags', [])),
            "primary_keys": safe_list(table_doc.get('primary_keys', [])),
            "foreign_keys_referencing_tables": safe_list(table_doc.get('foreign_keys_referencing_tables', [])),
            "primary_keys_referencing_tables": safe_list(table_doc.get('primary_keys_referencing_tables', [])),
            "created_by": safe_string(table_doc.get('created_by', '')),
            "created_at": safe_datetime(table_doc.get('created_at')),
            "last_updated_by": safe_string(table_doc.get('last_updated_by', '')),
            "updated_at": safe_datetime(table_doc.get('updated_at')),
            "human_feedback": clean_human_feedback(table_doc.get('human_feedback', []))
        }
        
        return search_doc


    def _prepare_column_document_for_search(self, column_doc: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare column document for Azure AI Search indexing"""
        column_data = column_doc.get('data', {})
        
        # Check if embedding_input is empty - skip if so
        embedding_input = str(column_doc.get('embedding_input', '')).strip()
        if not embedding_input:
            return None  # Signal to skip this document
        
        def safe_datetime(value):
            """Safely convert datetime string to proper format"""
            if isinstance(value, str) and value.strip():
                try:
                    # Ensure the datetime string ends with Z for UTC
                    if not value.endswith('Z'):
                        return value + 'Z' if 'T' in value else value
                    return value
                except:
                    return datetime.utcnow().isoformat() + "Z"
            return datetime.utcnow().isoformat() + "Z"
        
        def clean_human_feedback(feedback_list):
            """Clean human feedback array to remove empty objects"""
            if not isinstance(feedback_list, list):
                return []
            
            cleaned_feedback = []
            for feedback in feedback_list:
                if isinstance(feedback, dict):
                    user = str(feedback.get('user', '')).strip()
                    comment = str(feedback.get('comment', '')).strip()
                    timestamp = str(feedback.get('timestamp', '')).strip()
                    
                    cleaned_feedback.append({
                        "user": user,
                        "comment": comment,
                        "timestamp": timestamp
                    })
            
            return cleaned_feedback
        
        def safe_sample_values(values):
            """Safely convert sample values to strings"""
            if not isinstance(values, list):
                return []
            
            safe_values = []
            for value in values:
                if value is not None:
                    safe_values.append(str(value))
                else:
                    safe_values.append("")
            
            return safe_values
        
        def safe_list(value):
            """Safely convert value to list"""
            if isinstance(value, list):
                return [str(item) if item is not None else "" for item in value]
            return []
        
        def safe_string(value):
            """Safely convert value to string"""
            return str(value) if value is not None else ""
        
        def safe_boolean(value):
            """Safely convert value to boolean"""
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                return value.lower() in ('true', '1', 'yes')
            return bool(value) if value is not None else False
        
        # Prepare the complete document - DO NOT include embedding_vector from MongoDB
        search_doc = {
            "id": safe_string(column_data.get('id', '')),
            "label": safe_string(column_data.get('label', '')),
            "data_type": safe_string(column_data.get('data_type', '')),
            "nullable": safe_boolean(column_data.get('nullable', False)),
            "parent_id": safe_string(column_data.get('parent_id', '')),
            "parent_name": safe_string(column_data.get('parent_name', '')),
            "parent_type": safe_string(column_data.get('parent_type', '')),
            "description": safe_string(column_data.get('description', '')),
            "embedding_input": embedding_input,  # This will be embedded by Azure AI Search
            # Note: embedding_vector will be auto-generated by Azure AI Search from embedding_input
            "tags": safe_list(column_doc.get('tags', [])),
            "sample_values": safe_sample_values(column_doc.get('sample_values', [])),
            "created_by": safe_string(column_doc.get('created_by', '')),
            "created_at": safe_datetime(column_doc.get('created_at')),
            "last_updated_by": safe_string(column_doc.get('last_updated_by', '')),
            "updated_at": safe_datetime(column_doc.get('updated_at')),
            "human_feedback": clean_human_feedback(column_doc.get('human_feedback', []))
        }
        
        return search_doc


    def _index_table_documents(self) -> int:
        """Index all table documents to Azure AI Search"""
        if not self.table_search_client:
            print(" Table search client not initialized")
            return 0
        
        print("\nStarting table documents indexing to Azure AI Search...")
        
        # Get all updated table documents from MongoDB
        table_documents = self._get_all_table_documents()
        
        if not table_documents:
            print("No table documents found for indexing")
            return 0
        
        indexed_count = 0
        failed_count = 0
        skipped_count = 0  # Track skipped documents
        batch_documents = []
        batch_size = 50
        
        for i, table_doc in enumerate(table_documents):
            try:
                # Prepare document for search indexing
                search_doc = self._prepare_table_document_for_search(table_doc)
                
                # Skip documents with empty embedding_input
                if search_doc is None:
                    table_id = table_doc.get('data', {}).get('id', f'table_{i+1}')
                    print(f"   Skipping table {table_id}: Empty embedding_input")
                    skipped_count += 1
                    continue
                
                # Skip documents without valid ID
                if not search_doc.get("id"):
                    print(f"   Skipping table document {i+1}: Missing ID")
                    failed_count += 1
                    continue
                
                # Add merge or upload action
                search_doc["@search.action"] = "mergeOrUpload"
                batch_documents.append(search_doc)
                
                # Process in batches
                if len(batch_documents) >= batch_size:
                    try:
                        result = self.table_search_client.upload_documents(documents=batch_documents)
                        batch_indexed = len([r for r in result if r.succeeded])
                        batch_failed = len([r for r in result if not r.succeeded])
                        
                        indexed_count += batch_indexed
                        failed_count += batch_failed
                        
                        if batch_failed > 0:
                            print(f"   Batch had {batch_failed} failures")
                            for r in result:
                                if not r.succeeded:
                                    print(f"     Failed: {r.key} - {r.error_message}")
                        
                        batch_documents = []
                        
                    except Exception as batch_e:
                        print(f"   Error processing batch: {str(batch_e)}")
                        failed_count += len(batch_documents)
                        batch_documents = []
                        
            except Exception as e:
                table_id = table_doc.get('data', {}).get('id', f'table_{i+1}')
                print(f"   Error preparing table document {table_id} for indexing: {str(e)}")
                failed_count += 1
        
        # Process remaining documents
        if batch_documents:
            try:
                result = self.table_search_client.upload_documents(documents=batch_documents)
                batch_indexed = len([r for r in result if r.succeeded])
                batch_failed = len([r for r in result if not r.succeeded])
                
                indexed_count += batch_indexed
                failed_count += batch_failed
                
                if batch_failed > 0:
                    print(f"   Final batch had {batch_failed} failures")
                    for r in result:
                        if not r.succeeded:
                            print(f"     Failed: {r.key} - {r.error_message}")
                            
            except Exception as e:
                print(f"   Error indexing final batch of table documents: {str(e)}")
                failed_count += len(batch_documents)
        
        print(f"Indexed {indexed_count}/{len(table_documents)} table documents ({failed_count} failed, {skipped_count} skipped)")
        return indexed_count


    def _index_column_documents(self) -> int:
        """Index all column documents to Azure AI Search"""
        if not self.column_search_client:
            print("Column search client not initialized")
            return 0
        
        print("\nStarting column documents indexing to Azure AI Search...")
        
        # Get all updated column documents from MongoDB
        column_documents = self._get_all_column_documents()
        
        if not column_documents:
            print("No column documents found for indexing")
            return 0
        
        indexed_count = 0
        failed_count = 0
        skipped_count = 0  # Track skipped documents
        batch_documents = []
        batch_size = 50
        
        for i, column_doc in enumerate(column_documents):
            try:
                # Prepare document for search indexing
                search_doc = self._prepare_column_document_for_search(column_doc)
                
                # Skip documents with empty embedding_input
                if search_doc is None:
                    column_id = column_doc.get('data', {}).get('id', f'column_{i+1}')
                    print(f"   Skipping column {column_id}: Empty embedding_input")
                    skipped_count += 1
                    continue
                
                # Skip documents without valid ID
                if not search_doc.get("id"):
                    print(f"   Skipping column document {i+1}: Missing ID")
                    failed_count += 1
                    continue
                
                # Add merge or upload action
                search_doc["@search.action"] = "mergeOrUpload"
                batch_documents.append(search_doc)
                
                # Process in batches
                if len(batch_documents) >= batch_size:
                    try:
                        result = self.column_search_client.upload_documents(documents=batch_documents)
                        batch_indexed = len([r for r in result if r.succeeded])
                        batch_failed = len([r for r in result if not r.succeeded])
                        
                        indexed_count += batch_indexed
                        failed_count += batch_failed
                        
                        if batch_failed > 0:
                            print(f"   Batch had {batch_failed} failures")
                            for r in result:
                                if not r.succeeded:
                                    print(f"     Failed: {r.key} - {r.error_message}")
                        
                        batch_documents = []
                        
                    except Exception as batch_e:
                        print(f"   Error processing batch: {str(batch_e)}")
                        failed_count += len(batch_documents)
                        batch_documents = []
                        
            except Exception as e:
                column_id = column_doc.get('data', {}).get('id', f'column_{i+1}')
                print(f"   Error preparing column document {column_id} for indexing: {str(e)}")
                failed_count += 1
        
        # Process remaining documents
        if batch_documents:
            try:
                result = self.column_search_client.upload_documents(documents=batch_documents)
                batch_indexed = len([r for r in result if r.succeeded])
                batch_failed = len([r for r in result if not r.succeeded])
                
                indexed_count += batch_indexed
                failed_count += batch_failed
                
                if batch_failed > 0:
                    print(f"   Final batch had {batch_failed} failures")
                    for r in result:
                        if not r.succeeded:
                            print(f"     Failed: {r.key} - {r.error_message}")
                            
            except Exception as e:
                print(f"   Error indexing final batch of column documents: {str(e)}")
                failed_count += len(batch_documents)
        
        print(f" Indexed {indexed_count}/{len(column_documents)} column documents ({failed_count} failed, {skipped_count} skipped)")
        return indexed_count
    
    async def process_metadata_generation(self, batch_size: int = 4):
        """Process metadata generation for batch of tables  (Task 1)"""
        print("="*60)
        print("TASK 1: Starting metadata generation...")
        print("="*60)
        
        total_tables = self._get_total_table_count()
        print(f"Total tables to process: {total_tables}")
        total_start_time = time.perf_counter()
        
        processed_tables = 0
        total_columns_updated = 0
        skip = 0
        
        
        while skip < total_tables:
            batch_start_time = time.perf_counter()
            table_batch = self._get_table_documents_batch(skip, batch_size)

            if not table_batch:
                break

            print(f"\nBatch {skip + 1} to {skip + len(table_batch)}")

            # Run processing for this batch in parallel
            tasks = [
                self._process_table(skip + idx + 1, table_doc)
                for idx, table_doc in enumerate(table_batch)
            ]
            results = await asyncio.gather(*tasks)
            
            batch_end_time = time.perf_counter()  # 🔁 End batch timer
            print(f"🕒 Time taken for batch: {batch_end_time - batch_start_time:.2f} seconds")

            # Aggregate results
            processed_tables += sum(r["tables"] for r in results)
            total_columns_updated += sum(r["columns"] for r in results)

            skip += batch_size
            
    
            total_end_time = time.perf_counter()
        
        print(f"\n{'='*50}")
        print(f"TASK 1 COMPLETE: Metadata generation finished!")
        print(f"Tables processed: {processed_tables}/{total_tables}")
        print(f"Columns updated: {total_columns_updated}")
        print(f"🕒 Total time taken: {total_end_time - total_start_time:.2f} seconds")
        print(f"{'='*50}")
        
        return processed_tables > 0 or total_columns_updated > 0
    
    
    async def _process_table(self, index: int, table_doc: Dict[str, Any]) -> Dict[str, int]:
        """Process metadata generation for a single table (async LLM call)"""
        try:
            table_id = table_doc.get("data", {}).get("id")
            print(f"  → [{index}] Processing table: {table_id}")

            # 1. Get columns for this table
            column_docs = self._get_columns_for_table(table_id)

            # 2. Create prompts
            system_prompt = self._create_system_prompt()
            user_prompt = self._create_user_prompt(table_doc, column_docs)

            # 3. Query LLM
            llm_response = await self._query_llm(system_prompt, user_prompt)
            if not llm_response:
                print(f"    ✗ No LLM response for table {table_id}")
                return {"tables": 0, "columns": 0}

            # 4. Parse LLM response
            parsed = self._parse_llm_response(llm_response)
            if not parsed:
                print(f"    ✗ Failed to parse LLM response for table {table_id}")
                return {"tables": 0, "columns": 0}

            table_metadata = parsed.get("table_metadata", {})
            columns_metadata = parsed.get("columns_metadata", [])

            # 5. Update MongoDB documents
            updated_table = self._update_table_document(table_id, table_metadata)
            updated_columns = self._update_column_documents(columns_metadata)

            return {
                "tables": 1 if updated_table else 0,
                "columns": updated_columns
            }

        except Exception as e:
            print(f"    ✗ Error processing table {table_doc.get('data', {}).get('id')}: {str(e)}")
            return {"tables": 0, "columns": 0}
        
        finally:
            del table_doc
            del column_docs
            del system_prompt
            del user_prompt
            del llm_response
            del parsed
            del table_metadata
            del columns_metadata
            gc.collect()  
    
    def process_azure_search_indexing(self):
        """Process Azure AI Search indexing for all documents (Task 2)"""
        if not self.search_endpoint or not self.search_key:
            print(" Azure AI Search credentials not provided. Skipping indexing.")
            return False
        
        print("\n" + "="*60)
        print("TASK 2: Starting Azure AI Search indexing...")
        print("="*60)
        
        # Create search indexes
        print("Creating Azure AI Search indexes...")
        table_index_created = self._create_table_search_index()
        column_index_created = self._create_column_search_index()
        
        if not table_index_created or not column_index_created:
            print(" Failed to create search indexes")
            return False
        
        # Index table documents
        indexed_tables = self._index_table_documents()
        
        # Index column documents
        indexed_columns = self._index_column_documents()
        
        print(f"\n{'='*50}")
        print(f"TASK 2 COMPLETE: Azure AI Search indexing finished!")
        print(f"Tables indexed: {indexed_tables}")
        print(f"Columns indexed: {indexed_columns}")
        print(f"{'='*50}")
        
        return indexed_tables > 0 or indexed_columns > 0
    
    def process_complete_pipeline(self):
        """Execute the complete pipeline: Task 1 (Metadata) -> Task 2 (Indexing)"""
        print("Starting complete metadata processing and indexing pipeline...")
        print("="*80)
        
        # Task 1: Generate metadata using LLM and update MongoDB
        metadata_success = self.process_metadata_generation()
        
        if not metadata_success:
            print(" Task 1 failed. Stopping pipeline.")
            return
        
        # Task 2: Index documents to Azure AI Search
        indexing_success = self.process_azure_search_indexing()
        
        if not indexing_success:
            print(" Task 2 failed, but Task 1 completed successfully.")
            return
        
        print("\n" + "="*80)
        print("🎉 COMPLETE PIPELINE FINISHED SUCCESSFULLY!")
        print(" Task 1: Metadata generation and MongoDB updates - COMPLETED")
        print(" Task 2: Azure AI Search indexing - COMPLETED")
        print("="*80)


    def _calculate_cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        try:
            import numpy as np
            
            if not vec1 or not vec2 or len(vec1) != len(vec2):
                return 0.0
                
            vec1 = np.array(vec1)
            vec2 = np.array(vec2)
            
            # Calculate cosine similarity
            dot_product = np.dot(vec1, vec2)
            norm1 = np.linalg.norm(vec1)
            norm2 = np.linalg.norm(vec2)
            
            if norm1 == 0 or norm2 == 0:
                return 0.0
                
            return float(dot_product / (norm1 * norm2))
            
        except Exception as e:
            print(f"    Error calculating cosine similarity: {str(e)}")
            return 0.0

    def _find_similar_tables(self, target_table_doc: Dict[str, Any], all_tables: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:
        """Find top K most similar tables using embedding vectors"""
        target_embedding = target_table_doc.get('embedding_vector')
        target_id = target_table_doc.get('data', {}).get('id')
        
        if not target_embedding or not target_id:
            return []
        
        similarities = []
        
        for table_doc in all_tables:
            table_data = table_doc.get('data', {})
            table_id = table_data.get('id')
            table_embedding = table_doc.get('embedding_vector')
            
            # Skip same table
            if table_id == target_id:
                continue
                
            if not table_embedding:
                continue
                
            similarity = self._calculate_cosine_similarity(target_embedding, table_embedding)
            if similarity > 0:
                similarities.append({
                    'table_doc': table_doc,
                    'similarity': similarity,
                    'table_id': table_id,
                    'table_label': table_data.get('label', 'Unknown')
                })
        
        # Sort by similarity descending and return top K
        similarities.sort(key=lambda x: x['similarity'], reverse=True)
        return [item['table_doc'] for item in similarities[:top_k]]

    def _find_similar_columns(self, target_table_doc: Dict[str, Any], all_columns: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:
        """Find top K most similar columns using embedding vectors"""
        target_embedding = target_table_doc.get('embedding_vector')
        target_table_id = target_table_doc.get('data', {}).get('id')
        
        if not target_embedding or not target_table_id:
            return []
        
        similarities = []
        
        for column_doc in all_columns:
            column_data = column_doc.get('data', {})
            column_id = column_data.get('id')
            column_embedding = column_doc.get('embedding_vector')
            parent_id = column_data.get('parent_id')
            
            # Skip columns from same table
            if parent_id == target_table_id:
                continue
                
            if not column_embedding:
                continue
                
            similarity = self._calculate_cosine_similarity(target_embedding, column_embedding)
            if similarity > 0:
                similarities.append({
                    'column_doc': column_doc,
                    'similarity': similarity,
                    'column_id': column_id,
                    'column_label': column_data.get('label', 'Unknown'),
                    'parent_id': parent_id
                })
        
        # Sort by similarity descending and return top K
        similarities.sort(key=lambda x: x['similarity'], reverse=True)
        return [item['column_doc'] for item in similarities[:top_k]]
    

    def _get_table_name_by_id(self, table_id: str) -> str:
        """Get table name by table ID"""
        try:
            table_doc = self.table_collection.find_one({"data.id": table_id})
            if table_doc:
                return table_doc.get('data', {}).get('label', table_id)
            return table_id
        except Exception as e:
            print(f"    Error getting table name for ID {table_id}: {str(e)}")
            return table_id

    def _create_relationship_inference_prompt(self) -> str:
        """Load Relationship inference prompt from file""" 
        try:
            with open('prompts/relationship_inference.txt', 'r') as file:
                prompt = file.read().strip()
            return prompt
        except Exception as e:
            print(f"Error loading relationship inference prompt: {str(e)}")
            return "You are a database relationship expert specializing in inferring foreign key relationships and table references. Please analyze the provided data and respond with a valid JSON object containing inferred relationships."
        
    

    def _create_relationship_user_prompt(self, target_table: Dict[str, Any], similar_tables: List[Dict[str, Any]], similar_columns: List[Dict[str, Any]]) -> str:
            """Create user prompt for relationship inference"""
            
            target_data = target_table.get('data', {})
            target_info = f"""**TARGET TABLE:**
        - Table ID: {target_data.get('id', 'N/A')}
        - Table Label: {target_data.get('label', 'N/A')}
        - Table Type: {target_data.get('type', 'N/A')}
        - Description: {target_data.get('description', 'N/A')}
        - Embedding Input: {target_table.get('embedding_input', 'N/A')}
        - Current Foreign Keys: {target_table.get('foreign_keys_referencing_tables', [])}
        - Current Referencing Tables: {target_table.get('primary_keys_referencing_tables', [])}"""
            
            similar_tables_info = "**SIMILAR TABLES (Top 5):**\n"
            for i, table_doc in enumerate(similar_tables, 1):
                table_data = table_doc.get('data', {})
                similar_tables_info += f"""
        Table {i}:
        - Table ID: {table_data.get('id', 'N/A')}
        - Table Label: {table_data.get('label', 'N/A')}
        - Table Type: {table_data.get('type', 'N/A')}
        - Description: {table_data.get('description', 'N/A')}
        - Embedding Input: {table_doc.get('embedding_input', 'N/A')}"""
            
            similar_columns_info = "**SIMILAR COLUMNS (Top 5):**\n"
            for i, column_doc in enumerate(similar_columns, 1):
                column_data = column_doc.get('data', {})
                similar_columns_info += f"""
        Column {i}:
        - Column ID: {column_data.get('id', 'N/A')}
        - Column Label: {column_data.get('label', 'N/A')}
        - Data Type: {column_data.get('data_type', 'N/A')}
        - Parent Table ID: {column_data.get('parent_id', 'N/A')}
        - Description: {column_data.get('description', 'N/A')}
        - Embedding Input: {column_doc.get('embedding_input', 'N/A')}"""
            
            return f"""Analyze the following target table and its semantically similar tables/columns to infer potential relationships:

        {target_info}

        {similar_tables_info}

        {similar_columns_info}

        **ANALYSIS FOCUS:**
        1. **Foreign Key Relationships**: Which of the similar tables does the target table likely reference? Look for semantic patterns that suggest the target table has foreign keys pointing to other tables.

        2. **Referencing Relationships**: Which of the similar tables (or tables containing similar columns) likely reference the target table? Look for patterns suggesting other tables have foreign keys pointing to the target table.

        3. **Semantic Indicators**: Consider column names, data types, business context, and logical relationships between entities.

        **Requirements:**
        - Only suggest relationships with high confidence based on semantic similarity
        - Provide clear, business-focused relation descriptions
        - Avoid speculative relationships without semantic justification
        - Consider the embedding similarity as an indicator of semantic relatedness

        Respond with ONLY the JSON object - no explanations, no markdown, no code blocks."""


    def _create_user_prompt(self, table_doc: Dict[str, Any], column_docs: List[Dict[str, Any]]) -> str:
        """Create user prompt with table and column information"""
        
        # Extract table information
        table_data = table_doc.get('data', {})
        table_info = f"""**Table Information:**
- Table ID: {table_data.get('id', 'N/A')}
- Table Label: {table_data.get('label', 'N/A')}
- Table Type: {table_data.get('type', 'N/A')}
- Parent Type: {table_data.get('parent_type', 'N/A')}
- Parent ID: {table_data.get('parent_id', 'N/A')}
- Parent Name: {table_data.get('parent_name', 'N/A')}
- Primary Keys: {table_doc.get('primary_keys', [])}
- Foreign Keys (if known): {table_doc.get('foreign_keys_referencing_tables', [])}
- Referencing Tables: {table_doc.get('primary_keys_referencing_tables', [])}"""
        
        # Extract column information
        columns_info = "**Columns Information:**\n"
        for i, col_doc in enumerate(column_docs, 1):
            col_data = col_doc.get('data', {})

            columns_info += f"""
Column {i}:
- Column ID: {col_data.get('id', 'N/A')}
- Column Label: {col_data.get('label', 'N/A')}
- Data Type: {col_data.get('data_type', 'N/A')}
- Nullable: {col_data.get('nullable', 'N/A')}
- Sample Values: {col_doc.get('sample_values', [])}
- Foreign Key Indicators: <LLM to analyze based on name, type, and sample values> """

        return f"""Analyze the following table and column data to generate comprehensive metadata:

{table_info}

{columns_info}

**SPECIAL FOCUS ON FOREIGN KEY DETECTION:**
Look for columns that could be foreign keys by analyzing:
1. Column names ending with '_id', '_key', or containing 'id' 
2. Data types suitable for keys (int, bigint, uuid, varchar with key patterns)
3. Column names that suggest references to other entities
4. Patterns indicating relationships (customer_id, user_id, order_id, etc.)

**Requirements:**
- Generate meaningful descriptions and embedding inputs based on the table and column information
- Create relevant tags for searchability
- CRITICALLY IMPORTANT: Analyze and infer probable foreign key columns for the table
- Use the table structure and column details to infer business context
- Include all column IDs in the response for proper mapping

Respond with ONLY the JSON object - no explanations, no markdown, no code blocks."""

    def _update_table_relationships(self, table_id: str, foreign_keys_referencing_tables: List[Dict[str, Any]], primary_keys_referencing_tables: List[Dict[str, Any]]) -> bool:
        """Update table document with inferred relationships"""
        try:
            # Get current relationships
            current_table = self.table_collection.find_one({"data.id": table_id})
            if not current_table:
                return False
                
            # Update document - directly update the existing arrays
            update_doc = {
                "$set": {
                    "foreign_keys_referencing_tables": foreign_keys_referencing_tables,
                    "primary_keys_referencing_tables": primary_keys_referencing_tables,
                    "last_updated_by": "relationship_inference",
                    "updated_at": datetime.utcnow().isoformat() + "Z"
                }
            }
            
            # Log the update operation
            table_name = current_table.get('data', {}).get('label', table_id)
            print(f"    Building update query for table: {table_name} (ID: {table_id})")
            print(f"    Query filter: {{'data.id': '{table_id}'}}")
            print(f"    Foreign keys count: {len(foreign_keys_referencing_tables)}")
            print(f"    Referencing tables count: {len(primary_keys_referencing_tables)}")
            
            result = self.table_collection.update_one(
                {"data.id": table_id},
                update_doc
            )
            
            print(f"    Update result - Modified count: {result.modified_count}, Matched count: {result.matched_count}")
            
            return result.matched_count > 0
            
        except Exception as e:
            print(f"    Error updating relationships for table {table_id}: {str(e)}")
            return False

    def _update_bidirectional_relationships(self, relationships: List[Dict[str, Any]]) -> None:
        """Update bidirectional relationships for all affected tables"""
        try:
            for relationship in relationships:
                relationship_type = relationship.get('type')  # 'foreign_keys_referencing_tables' or 'referencing'
                source_table_name = relationship.get('source_table_name')
                target_table_name = relationship.get('target_table_name') 
                linking_column = relationship.get('linking_column', '')
                relation_description = relationship.get('relation_description', '')
                
                if relationship_type == 'foreign_keys_referencing_tables':
                    # Update the target table's primary_keys_referencing_tables
                    target_table = self.table_collection.find_one({"data.label": target_table_name})
                    if target_table:
                        current_refs = target_table.get('primary_keys_referencing_tables', [])
                        # Check if this reverse relationship already exists
                        if not any(ref.get('to_table') == source_table_name for ref in current_refs):
                            # Create reverse relationship description
                            reverse_description = f"Referenced by {source_table_name}: {relation_description}"
                            new_ref = {
                                'to_table': source_table_name,
                                'linking_column': linking_column,
                                'relation_description': reverse_description
                            }
                            current_refs.append(new_ref)
                            
                            # Log the bidirectional update query
                            target_id = target_table.get('data', {}).get('id', '')
                            print(f"    Bidirectional update for table: {target_table_name} (ID: {target_id})")
                            print(f"    Adding referencing table: {new_ref}")
                            
                            self.table_collection.update_one(
                                {"data.label": target_table_name},
                                {"$set": {"primary_keys_referencing_tables": current_refs}}
                            )
                
                elif relationship_type == 'primary_keys_referencing_tables':
                    # Update the source table's foreign_keys_referencing_tables
                    source_table = self.table_collection.find_one({"data.label": source_table_name})
                    if source_table:
                        current_fks = source_table.get('foreign_keys_referencing_tables', [])
                        current_table_name = relationship.get('current_table_name')
                        # Check if this reverse relationship already exists
                        if not any(fk.get('target_table_name') == current_table_name for fk in current_fks):
                            # Create reverse relationship description
                            reverse_description = f"References {current_table_name}: {relation_description}"
                            new_fk = {
                                'target_table_name': current_table_name,
                                'linking_column': linking_column,
                                'relation_description': reverse_description
                            }
                            current_fks.append(new_fk)
                            
                            # Log the bidirectional update query
                            source_id = source_table.get('data', {}).get('id', '')
                            print(f"    Bidirectional update for table: {source_table_name} (ID: {source_id})")
                            print(f"    Adding foreign key: {new_fk}")
                            
                            self.table_collection.update_one(
                                {"data.label": source_table_name},
                                {"$set": {"foreign_keys_referencing_tables": current_fks}}
                            )
                            
        except Exception as e:
            print(f"    Error updating bidirectional relationships: {str(e)}")

                
    async def process_relationship_inference(self):
        """Process relationship inference for all tables (Task 3)"""
        print("\n" + "="*60)
        print("TASK 3: Starting relationship inference...")
        print("="*60)
        
        # Get all table and column documents with embeddings
        print("Loading all table and column documents...")
        all_tables = [doc for doc in self._get_all_table_documents() if doc.get('embedding_vector')]
        all_columns = [doc for doc in self._get_all_column_documents() if doc.get('embedding_vector')]
        
        if not all_tables:
            print("No tables with embeddings found for relationship inference")
            return False
        
        print(f"Found {len(all_tables)} tables and {len(all_columns)} columns with embeddings")
        
        total_tables = len(all_tables)
        processed_tables = 0
        total_relationships_added = 0
        all_bidirectional_updates = []
        
        for idx, target_table in enumerate(all_tables, 1):
            target_data = target_table.get('data', {})
            table_id = target_data.get('id')
            table_name = target_data.get('label', 'Unknown')
            
            print(f"\nProcessing table {idx}/{total_tables}: {table_name} (ID: {table_id})")
            
            # Find similar tables and columns
            print(f"  Finding similar tables and columns...")

            # Log the query for similar tables
            print(f"  Querying MongoDB for similar tables (Top 5)...")
            similar_tables_query = {"embedding_vector": {"$exists": True}}
            print(f"  MongoDB Query for similar tables: {similar_tables_query}")
            similar_tables = self._find_similar_tables(target_table, all_tables, top_k=5)

            # Log the query for similar columns
            print(f"  Querying MongoDB for similar columns (Top 5)...")
            similar_columns_query = {"embedding_vector": {"$exists": True}}
            print(f"  MongoDB Query for similar columns: {similar_columns_query}")
            similar_columns = self._find_similar_columns(target_table, all_columns, top_k=5)

            
            
            if not similar_tables and not similar_columns:
                print(f"  No similar entities found for table {table_id}")
                continue
            
            # Query LLM for relationship inference
            print(f"  Querying LLM for relationship inference...")
            user_prompt = self._create_relationship_user_prompt(target_table, similar_tables, similar_columns)
            # print(f"  User prompt created for table {table_id}:\n{user_prompt}\n")
            llm_response = await self._query_llm(self._create_relationship_inference_prompt(), user_prompt)
            print(f" LLM response received for table {llm_response}")
            
            if not llm_response:
                print(f"  Failed to get LLM response for table {table_id}")
                continue
            
            # Parse LLM response
            parsed_relationships = self._parse_llm_response(llm_response)
            
            if not parsed_relationships:
                print(f"  Failed to parse LLM response for table {table_id}")
                continue
            
            # Extract relationships
            foreign_keys_referencing_tables = parsed_relationships.get("foreign_keys_referencing_tables", [])
            primary_keys_referencing_tables = parsed_relationships.get("primary_keys_referencing_tables", [])
            
            # Update table relationships
            success = self._update_table_relationships(table_id, foreign_keys_referencing_tables, primary_keys_referencing_tables)
            if success:
                processed_tables += 1
                relationships_count = len(foreign_keys_referencing_tables) + len(primary_keys_referencing_tables)
                total_relationships_added += relationships_count
                print(f"   Updated {relationships_count} relationships for table {table_name}")
                
                # Prepare bidirectional updates
                for fk in foreign_keys_referencing_tables:
                    all_bidirectional_updates.append({
                        'type': 'foreign_keys_referencing_tables',
                        'source_table_name': table_name,
                        'target_table_name': fk.get('target_table_name'),
                        'linking_column': fk.get('linking_column', ''),
                        'relation_description': fk.get('relation_description', '')
                    })
                
                for ref in primary_keys_referencing_tables:
                    all_bidirectional_updates.append({
                        'type': 'referencing',
                        'source_table_name': ref.get('to_table'),
                        'current_table_name': table_name,
                        'linking_column': ref.get('linking_column', ''),
                        'relation_description': ref.get('relation_description', '')
                    })
            else:
                print(f"   Failed to update relationships for table {table_name}")
        
        # Process bidirectional updates
        if all_bidirectional_updates:
            print(f"\nProcessing {len(all_bidirectional_updates)} bidirectional relationship updates...")
            self._update_bidirectional_relationships(all_bidirectional_updates)
            print(" Bidirectional relationships updated")
        
        print(f"\n{'='*50}")
        print(f"TASK 3 COMPLETE: Relationship inference finished!")
        print(f"Tables processed: {processed_tables}/{total_tables}")
        print(f"Total relationships added: {total_relationships_added}")
        print(f"{'='*50}")
        
        return processed_tables > 0

async def run_mongodb_metadata_task():
    """Task 1: Run MongoDB metadata generation only"""
    print("Starting MongoDB Metadata Generation Task...")
    print("="*60)
    
    config = Config()
    
    with MongoDBMetadataProcessor(config) as processor:
        success = await processor.process_metadata_generation()
        if success:
            print("MongoDB metadata task completed successfully!")
        else:
            print("MongoDB metadata task failed!")
        return success


def run_azure_search_task():
    """Task 2: Run Azure AI Search indexing only"""
    print("Starting Azure Search Indexing Task...")
    print("="*60)
    
    config = Config()
    
    if not config.SEARCH_ENDPOINT or not config.SEARCH_KEY:
        print("Azure AI Search credentials not provided. Please set AZURE_SEARCH_ENDPOINT and AZURE_SEARCH_ADMIN_KEY environment variables.")
        return False
    
    with MongoDBMetadataProcessor(config) as processor:
        success = processor.process_azure_search_indexing()
        if success:
            print("Azure Search indexing task completed successfully!")
        else:
            print("Azure Search indexing task failed!")
        return success

async def run_relationship_inference_task():
    """Task 3: Run relationship inference only"""
    print("Starting Relationship Inference Task...")
    print("="*60)
    
    config = Config()
    
    processor = MongoDBMetadataProcessor(config)
    
    try:
        success = await processor.process_relationship_inference()
        # success = processor.process_relationship_inference()
        if success:
            print("Relationship inference task completed successfully!")
        else:
            print("Relationship inference task failed!")
        return success
    finally:
        processor.client.close()

async def main(): 
    print("MongoDB Metadata Processor")
    print("="*80)
    
    # Task 1: MongoDB Metadata Generation (REQUIRED)
    mongodb_success = await run_mongodb_metadata_task()
    
    if not mongodb_success:
        print("\nTask 1 failed. Stopping pipeline - Task 1 is required for subsequent tasks.")
        print("="*80)
        exit(1)
    
    print("\n")
    
    # Task 2: Azure Search Indexing (OPTIONAL)
    azure_success = run_azure_search_task()
    
    print("\n")
    
    # Task 3: Relationship Inference (RUNS if Task 1 succeeded, regardless of Task 2)
    relationship_success = await run_relationship_inference_task()
    
    print("\n" + "="*80)
    print("PIPELINE EXECUTION SUMMARY:")
    print(f"Task 1 (Metadata Generation): {' SUCCESS' if mongodb_success else ' FAILED'}")
    print(f"Task 2 (Azure Search Indexing): {' SUCCESS' if azure_success else ' FAILED/SKIPPED'}")
    print(f"Task 3 (Relationship Inference): {' SUCCESS' if relationship_success else ' FAILED'}")
    
    if mongodb_success and relationship_success:
        if azure_success:
            print("\nALL TASKS COMPLETED SUCCESSFULLY!")
        else:
            print("\nCore tasks completed successfully (Azure Search optional task failed/skipped)")
    else:
        print("\nSome tasks failed - check logs above")
    print("="*80)
    
    
if __name__ == "__main__":
    asyncio.run(main())
```


