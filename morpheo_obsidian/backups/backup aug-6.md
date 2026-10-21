
```python
# #run_relationship_inference_task.py

# import datetime

# import numpy as np

# import json

  

# from typing import List, Dict, Any, Optional

# from utils.config import Config

# from utils.llm_query import _query_llm

# from utils.load_prompt import load_prompt

# from pymongo import MongoClient

# from pymongo.database import Database

# from pymongo.collection import Collection

# from langchain_community.chat_models import AzureChatOpenAI

# from utils.logger import logger

  

# class RelationshipInference:

# def __init__(self, config: Config):

# self.config = config

# # Initialize MongoDB connection

# self.client = MongoClient(self.config.MONGO_CONNECTION_STRING)

# self.db: Database = self.client[self.config.DATABASE_NAME]

# self.table_collection: Collection = self.db[self.config.TABLE_COLLECTION_NAME]

# self.column_collection: Collection = self.db[self.config.COLUMN_COLLECTION_NAME]

# # Initialize LLM

# self.llm = AzureChatOpenAI(

# model_name=self.config.INFERENCE_MODEL,

# openai_api_key=self.config.OPENAI_API_KEY,

# openai_api_base=self.config.OPENAI_API_URL,

# openai_api_version=self.config.OPENAI_API_VERSION,

# temperature=0.1

# )

  

# def _create_relationship_inference_prompt(self) -> str:

# """Ultra-optimized single prompt that guarantees correct output without needing validation functions"""

# return load_prompt("relationship_system_prompt")

  

# def _find_referencing_tables_by_key_matching(self, target_table_doc: Dict[str, Any]) -> List[Dict[str, Any]]:

# """Find tables that reference the target table by matching against its primary keys"""

# target_data = target_table_doc.get('data', {})

# target_table_id = target_data.get('id')

# target_table_name = target_data.get('label')

# if not target_table_id or not target_table_name:

# return []

# print(f" Finding referencing tables using primary key matching for table: {target_table_name}")

# # CORRECTED: Get primary keys from the top-level document

# primary_keys = target_table_doc.get('primary_keys', [])

# if not primary_keys:

# print(f" No primary keys defined for table {target_table_name}")

# return []

# print(f" Primary keys: {primary_keys}")

# # Find columns in other tables that match these primary key names

# query = {

# "data.label": {"$in": primary_keys},

# "data.parent_id": {"$ne": target_table_id} # Exclude the target table itself

# }

# print(f" MongoDB Query for referencing columns: {query}")

# matching_columns_cursor = self.column_collection.find(query)

# matching_columns = list(matching_columns_cursor)

# if not matching_columns:

# print(f" No matching columns found for primary keys")

# return []

# # Group matching columns by their parent table

# table_matches = {}

# for col in matching_columns:

# col_data = col.get('data', {})

# parent_id = col_data.get('parent_id')

# col_name = col_data.get('label')

# if parent_id not in table_matches:

# table_matches[parent_id] = set()

# table_matches[parent_id].add(col_name)

# # Get the actual table documents for the referencing tables

# referencing_table_ids = list(table_matches.keys())

# if not referencing_table_ids:

# return []

# referencing_tables_query = {"data.id": {"$in": referencing_table_ids}}

# print(f" MongoDB Query for referencing tables: {referencing_tables_query}")

# referencing_tables_cursor = self.table_collection.find(referencing_tables_query)

# referencing_tables = list(referencing_tables_cursor)

# # Add matching column info to each table

# for table in referencing_tables:

# table_id = table.get('data', {}).get('id')

# if table_id in table_matches:

# table['matching_columns'] = list(table_matches[table_id])

# print(f" Found {len(referencing_tables)} tables through primary key matching:")

# for table in referencing_tables:

# table_data = table.get('data', {})

# print(f" - Table ID: {table_data.get('id')}, Name: {table_data.get('label', 'Unknown')}, "

# f"Matching columns: {table.get('matching_columns', [])}")

# return referencing_tables

  

# def _find_similar_columns_to_primary_keys(self, target_table_doc: Dict[str, Any], all_columns: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:

# """

# Step 2: Find columns that are semantically similar to the target table's PRIMARY KEY columns

# """

# target_data = target_table_doc.get('data', {})

# target_table_id = target_data.get('id')

# target_table_name = target_data.get('label')

# if not target_table_id or not target_table_name:

# return []

# print(f" Step 2: Finding columns semantically similar to primary keys of table: {target_table_name}")

# # Get primary keys from the target table

# primary_keys = target_table_doc.get('primary_keys', [])

# if not primary_keys:

# print(f" No primary keys defined for table {target_table_name}")

# return []

# print(f" Primary keys to find similar columns for: {primary_keys}")

# # Get embeddings for each primary key column

# primary_key_embeddings = {}

# for pk_name in primary_keys:

# pk_column_query = {

# "data.label": pk_name,

# "data.parent_id": target_table_id,

# "embedding_vector": {"$exists": True}

# }

# pk_column_doc = self.column_collection.find_one(pk_column_query)

# if pk_column_doc and pk_column_doc.get('embedding_vector'):

# primary_key_embeddings[pk_name] = {

# 'embedding': pk_column_doc['embedding_vector'],

# 'column_doc': pk_column_doc

# }

# print(f" Found embedding for primary key: {pk_name}")

# else:

# print(f" WARNING: No embedding found for primary key column: {pk_name}")

# if not primary_key_embeddings:

# print(f" No embeddings found for any primary key columns")

# return []

# # Find similar columns for each primary key

# all_similar_columns = []

# similarity_threshold = 0.6

# for pk_name, pk_info in primary_key_embeddings.items():

# pk_embedding = pk_info['embedding']

# print(f" Finding columns similar to primary key '{pk_name}'...")

# similarities = []

# for column_doc in all_columns:

# column_data = column_doc.get('data', {})

# column_id = column_data.get('id')

# column_embedding = column_doc.get('embedding_vector')

# parent_id = column_data.get('parent_id')

# column_label = column_data.get('label', 'Unknown')

# # Skip columns from same table

# if parent_id == target_table_id:

# continue

# if not column_embedding:

# continue

# similarity = self._calculate_cosine_similarity(pk_embedding, column_embedding)

# if similarity >= similarity_threshold:

# similarities.append({

# 'column_doc': column_doc,

# 'similarity': similarity,

# 'column_id': column_id,

# 'column_label': column_label,

# 'parent_id': parent_id,

# 'matched_primary_key': pk_name

# })

# # Sort by similarity and take top results for this primary key

# similarities.sort(key=lambda x: x['similarity'], reverse=True)

# pk_top_similar = similarities[:top_k]

# print(f" Found {len(pk_top_similar)} similar columns for primary key '{pk_name}'")

# for i, item in enumerate(pk_top_similar, 1):

# print(f" {i}. Column: {item['column_label']} (ID: {item['column_id']}, "

# f"Parent: {item['parent_id']}, Similarity: {item['similarity']:.4f})")

# all_similar_columns.extend(pk_top_similar)

# # Now get the parent tables of these similar columns

# parent_table_ids = list(set([col['parent_id'] for col in all_similar_columns]))

# if not parent_table_ids:

# print(f" No parent tables found for similar columns")

# return []

# # Get parent table documents

# parent_tables_query = {"data.id": {"$in": parent_table_ids}}

# print(f" MongoDB Query for parent tables: {parent_tables_query}")

# parent_tables_cursor = self.table_collection.find(parent_tables_query)

# parent_tables = list(parent_tables_cursor)

# # Add semantic matching information to each parent table

# for table in parent_tables:

# table_id = table.get('data', {}).get('id')

# matching_columns_info = [

# col for col in all_similar_columns

# if col['parent_id'] == table_id

# ]

# table['semantic_matching_columns'] = matching_columns_info

# table['matching_columns'] = [

# f"{col['column_label']} (semantic: {col['similarity']:.3f} -> PK: {col['matched_primary_key']})"

# for col in matching_columns_info

# ]

# print(f" Found {len(parent_tables)} parent tables through semantic column similarity:")

# for table in parent_tables:

# table_data = table.get('data', {})

# table_name = table_data.get('label', 'Unknown')

# table_id = table_data.get('id')

# matching_info = table.get('semantic_matching_columns', [])

# print(f" - Table: {table_name} (ID: {table_id})")

# for match in matching_info:

# print(f" * Column '{match['column_label']}' matches PK '{match['matched_primary_key']}' "

# f"(similarity: {match['similarity']:.4f})")

# return parent_tables

  

# def _merge_and_deduplicate_primary_key_tables(self, key_matched_tables: List[Dict[str, Any]], semantic_similar_tables: List[Dict[str, Any]], target_table_id: str) -> List[Dict[str, Any]]:

# """

# Step 3: Merge key-matched tables with semantically similar tables for primary_keys_referencing_tables and remove duplicates

# """

# print(f" Step 3: Merging key-matched tables with semantic similarity results for primary keys...")

# print(f" Key-matched tables count: {len(key_matched_tables)}")

# print(f" Semantic similar tables count: {len(semantic_similar_tables)}")

# # Create a dictionary to store unique tables by ID

# unique_tables = {}

# # Add key-matched tables first (higher priority)

# for table in key_matched_tables:

# table_data = table.get('data', {})

# table_id = table_data.get('id')

# if table_id and table_id != target_table_id:

# unique_tables[table_id] = {

# 'table_doc': table,

# 'source': 'key_matching',

# 'table_name': table_data.get('label', 'Unknown')

# }

# # Add semantic similar tables (lower priority, won't overwrite key-matched)

# for table in semantic_similar_tables:

# table_data = table.get('data', {})

# table_id = table_data.get('id')

# if table_id and table_id != target_table_id and table_id not in unique_tables:

# unique_tables[table_id] = {

# 'table_doc': table,

# 'source': 'semantic_similarity',

# 'table_name': table_data.get('label', 'Unknown')

# }

# elif table_id in unique_tables:

# # Table found in both - enhance with semantic info

# existing_table = unique_tables[table_id]['table_doc']

# semantic_info = table.get('semantic_matching_columns', [])

# if semantic_info:

# if 'semantic_matching_columns' not in existing_table:

# existing_table['semantic_matching_columns'] = []

# existing_table['semantic_matching_columns'].extend(semantic_info)

# # Update matching_columns to show both exact and semantic

# existing_exact = existing_table.get('matching_columns', [])

# semantic_columns = [

# f"{match['column_label']} (semantic: {match['similarity']:.3f} -> PK: {match['matched_primary_key']})"

# for match in semantic_info

# ]

# existing_table['matching_columns'] = existing_exact + semantic_columns

# unique_tables[table_id]['source'] = 'exact_and_semantic_matching'

# print(f" Enhanced exact match for {table_data.get('label')} with semantic info")

# # Convert back to list and log the results

# merged_tables = [item['table_doc'] for item in unique_tables.values()]

# print(f" Merged results: {len(merged_tables)} unique tables")

# print(f" Table sources breakdown:")

# key_matched_count = sum(1 for item in unique_tables.values() if item['source'] == 'key_matching')

# semantic_count = sum(1 for item in unique_tables.values() if item['source'] == 'semantic_similarity')

# both_count = sum(1 for item in unique_tables.values() if item['source'] == 'exact_and_semantic_matching')

# print(f" - Key matching: {key_matched_count} tables")

# print(f" - Semantic similarity: {semantic_count} tables")

# print(f" - Both methods: {both_count} tables")

# # Log the final merged table list

# for idx, item in enumerate(unique_tables.values(), 1):

# print(f" {idx}. {item['table_name']} (Source: {item['source']})")

# return merged_tables

  

# def _find_similar_columns_for_foreign_keys(self, target_table_doc: Dict[str, Any], all_columns: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:

# """

# Find columns that are semantically similar to the target table's FOREIGN KEY columns

# """

# target_data = target_table_doc.get('data', {})

# target_table_id = target_data.get('id')

# target_table_name = target_data.get('label')

# if not target_table_id or not target_table_name:

# return []

# print(f" Finding columns semantically similar to foreign keys of table: {target_table_name}")

# # Get foreign keys from the target table

# foreign_keys = target_table_doc.get('foreign_keys', [])

# if not foreign_keys:

# print(f" No foreign keys defined for table {target_table_name}")

# return []

# print(f" Foreign keys to find similar columns for: {foreign_keys}")

# # Get embeddings for each foreign key column

# foreign_key_embeddings = {}

# for fk_name in foreign_keys:

# fk_column_query = {

# "data.label": fk_name,

# "data.parent_id": target_table_id,

# "embedding_vector": {"$exists": True}

# }

# fk_column_doc = self.column_collection.find_one(fk_column_query)

# if fk_column_doc and fk_column_doc.get('embedding_vector'):

# foreign_key_embeddings[fk_name] = {

# 'embedding': fk_column_doc['embedding_vector'],

# 'column_doc': fk_column_doc

# }

# print(f" Found embedding for foreign key: {fk_name}")

# else:

# print(f" WARNING: No embedding found for foreign key column: {fk_name}")

# if not foreign_key_embeddings:

# print(f" No embeddings found for any foreign key columns")

# return []

# # Find similar columns for each foreign key

# all_similar_columns = []

# similarity_threshold = 0.6 # Adjust as needed

# for fk_name, fk_info in foreign_key_embeddings.items():

# fk_embedding = fk_info['embedding']

# print(f" Finding columns similar to foreign key '{fk_name}'...")

# similarities = []

# # Only compare with PRIMARY KEY columns from other tables

# for column_doc in all_columns:

# column_data = column_doc.get('data', {})

# column_id = column_data.get('id')

# column_embedding = column_doc.get('embedding_vector')

# parent_id = column_data.get('parent_id')

# column_label = column_data.get('label', 'Unknown')

# # Skip columns from same table

# if parent_id == target_table_id:

# continue

# if not column_embedding:

# continue

# # Check if this column is a primary key in its parent table

# parent_table = self.table_collection.find_one({"data.id": parent_id})

# if not parent_table:

# continue

# parent_primary_keys = parent_table.get('primary_keys', [])

# if column_label not in parent_primary_keys:

# continue # Only consider primary key columns

# similarity = self._calculate_cosine_similarity(fk_embedding, column_embedding)

# if similarity >= similarity_threshold:

# similarities.append({

# 'column_doc': column_doc,

# 'similarity': similarity,

# 'column_id': column_id,

# 'column_label': column_label,

# 'parent_id': parent_id,

# 'parent_table': parent_table,

# 'matched_foreign_key': fk_name

# })

# # Sort by similarity and take top results for this foreign key

# similarities.sort(key=lambda x: x['similarity'], reverse=True)

# fk_top_similar = similarities[:top_k]

# print(f" Found {len(fk_top_similar)} similar primary key columns for foreign key '{fk_name}'")

# for i, item in enumerate(fk_top_similar, 1):

# parent_table_name = item['parent_table'].get('data', {}).get('label', 'Unknown')

# print(f" {i}. Column: {item['column_label']} in table: {parent_table_name} "

# f"(Similarity: {item['similarity']:.4f})")

# all_similar_columns.extend(fk_top_similar)

# # Now get the parent tables of these similar columns

# parent_tables = []

# seen_table_ids = set()

# for col_info in all_similar_columns:

# parent_table = col_info['parent_table']

# table_id = parent_table.get('data', {}).get('id')

# if table_id not in seen_table_ids:

# seen_table_ids.add(table_id)

# # Add semantic matching information to the table

# matching_columns_info = [

# col for col in all_similar_columns

# if col['parent_id'] == table_id

# ]

# parent_table['semantic_fk_matching_columns'] = matching_columns_info

# parent_table['fk_matching_columns'] = [

# f"FK '{col['matched_foreign_key']}' -> PK '{col['column_label']}' (similarity: {col['similarity']:.3f})"

# for col in matching_columns_info

# ]

# parent_tables.append(parent_table)

# print(f" Found {len(parent_tables)} target tables through semantic foreign key similarity:")

# for table in parent_tables:

# table_data = table.get('data', {})

# table_name = table_data.get('label', 'Unknown')

# table_id = table_data.get('id')

# matching_info = table.get('semantic_fk_matching_columns', [])

# print(f" - Target Table: {table_name} (ID: {table_id})")

# for match in matching_info:

# print(f" * FK '{match['matched_foreign_key']}' -> PK '{match['column_label']}' "

# f"(similarity: {match['similarity']:.4f})")

# return parent_tables

  

# def _create_relationship_user_prompt(self, target_table: Dict[str, Any], similar_tables_pk: List[Dict[str, Any]], similar_tables_fk: List[Dict[str, Any]], similar_columns: List[Dict[str, Any]]) -> str:

# """Create user prompt for relationship inference"""

# target_data = target_table.get('data', {})

# target_info = f"""**TARGET TABLE:**

# - Table ID: {target_data.get('id', 'N/A')}

# - Table Label: {target_data.get('label', 'N/A')}

# - Table Type: {target_data.get('type', 'N/A')}

# - Description: {target_data.get('description', 'N/A')}

# - Embedding Input: {target_table.get('embedding_input', 'N/A')}

# - Primary Keys: {target_table.get('primary_keys', [])}

# - Foreign Keys: {target_table.get('foreign_keys', [])}

# - Current Foreign Keys: {target_table.get('foreign_keys_referencing_tables', [])}

# - Current Referencing Tables: {target_table.get('primary_keys_referencing_tables', [])}"""

# similar_tables_pk_info = "**SIMILAR TABLES FOR PRIMARY KEY RELATIONSHIPS (Key + Semantic Matching):**\n"

# for i, table_doc in enumerate(similar_tables_pk, 1):

# table_data = table_doc.get('data', {})

# similar_tables_pk_info += f"""

# Table {i}:

# - Table ID: {table_data.get('id', 'N/A')}

# - Table Label: {table_data.get('label', 'N/A')}

# - Table Type: {table_data.get('type', 'N/A')}

# - Description: {table_data.get('description', 'N/A')}

# - Embedding Input: {table_doc.get('embedding_input', 'N/A')}

# - Matching Info: {table_doc.get('matching_columns', [])}"""

  

# similar_tables_fk_info = "**SIMILAR TABLES FOR FOREIGN KEY RELATIONSHIPS (Semantic Matching):**\n"

# for i, table_doc in enumerate(similar_tables_fk, 1):

# table_data = table_doc.get('data', {})

# similar_tables_fk_info += f"""

# Table {i}:

# - Table ID: {table_data.get('id', 'N/A')}

# - Table Label: {table_data.get('label', 'N/A')}

# - Table Type: {table_data.get('type', 'N/A')}

# - Description: {table_data.get('description', 'N/A')}

# - Embedding Input: {table_doc.get('embedding_input', 'N/A')}

# - FK Matching Info: {table_doc.get('fk_matching_columns', [])}"""

# similar_columns_info = "**SIMILAR COLUMNS (Top 5):**\n"

# for i, column_doc in enumerate(similar_columns, 1):

# column_data = column_doc.get('data', {})

# similar_columns_info += f"""

# Column {i}:

# - Column ID: {column_data.get('id', 'N/A')}

# - Column Label: {column_data.get('label', 'N/A')}

# - Data Type: {column_data.get('data_type', 'N/A')}

# - Parent Table ID: {column_data.get('parent_id', 'N/A')}

# - Description: {column_data.get('description', 'N/A')}

# - Embedding Input: {column_doc.get('embedding_input', 'N/A')}"""

# return f"""Analyze the following target table and its semantically similar tables/columns to infer potential relationships:

  

# {target_info}

  

# {similar_tables_pk_info}

  

# {similar_tables_fk_info}

  

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

# def _parse_llm_response(self, response: str, current_table_name: str) -> Optional[Dict[str, Any]]:

# """Parse and validate LLM response to extract metadata JSON and filter self-references"""

# try:

# clean_response = response.strip()

  

# # Strip markdown/code block if present

# if clean_response.startswith('```'):

# lines = clean_response.split('\n')

# if lines[0].strip() in ['```json', '```']:

# lines = lines[1:]

# if lines and lines[-1].strip() == '```':

# lines = lines[:-1]

# clean_response = '\n'.join(lines)

  

# # Find start and end of JSON

# start_idx = clean_response.find('{')

# if start_idx == -1:

# print(" No JSON object found in response")

# return None

  

# brace_count = 0

# end_idx = -1

# for i in range(start_idx, len(clean_response)):

# if clean_response[i] == '{':

# brace_count += 1

# elif clean_response[i] == '}':

# brace_count -= 1

# if brace_count == 0:

# end_idx = i

# break

  

# if end_idx == -1:

# print(" Could not find matching closing brace")

# return None

  

# json_str = clean_response[start_idx:end_idx+1]

# metadata_json = json.loads(json_str)

  

# # Ensure JSON is a dict

# if isinstance(metadata_json, list):

# if metadata_json and isinstance(metadata_json[0], dict):

# metadata_json = metadata_json[0]

# else:

# print(" Parsed JSON is a list but doesn't contain a dictionary")

# return None

  

# # === Begin Validation & Auto-fix ===

# validated = {

# "foreign_keys_referencing_tables": [],

# "primary_keys_referencing_tables": []

# }

  

# # Validate foreign_keys and filter self-references

# fk_list = metadata_json.get("foreign_keys_referencing_tables", [])

# if fk_list is None:

# fk_list = []

# filtered_fk_count = 0

# for item in fk_list:

# if not all(k in item for k in ["target_table_name", "linking_column", "relation_description", "relationship"]):

# continue # Skip invalid entry

# if item["relationship"] is None:

# continue

# # Filter out self-references

# target_table = item.get("target_table_name", "")

# if target_table == current_table_name:

# print(f" FILTERED: Self-reference foreign key to {target_table}")

# filtered_fk_count += 1

# continue

# validated["foreign_keys_referencing_tables"].append(item)

  

# # Validate primary_keys and filter self-references

# pk_list = metadata_json.get("primary_keys_referencing_tables", [])

# if pk_list is None:

# pk_list = []

# filtered_pk_count = 0

# for item in pk_list:

# if not all(k in item for k in ["to_table", "linking_column", "relation_description", "relationship"]):

# continue

# if item["relationship"] is None:

# continue

# # Filter out self-references

# to_table = item.get("to_table", "")

# if to_table == current_table_name:

# print(f" FILTERED: Self-reference primary key from {to_table}")

# filtered_pk_count += 1

# continue

# validated["primary_keys_referencing_tables"].append(item)

  

# # Log filtering results

# if filtered_fk_count > 0 or filtered_pk_count > 0:

# print(f" Self-reference filtering: Removed {filtered_fk_count} foreign keys, {filtered_pk_count} primary keys")

  

# return validated

  

# except json.JSONDecodeError as e:

# print(f" JSON decode error: {str(e)}")

# return None

# except Exception as e:

# print(f" Error parsing LLM response: {str(e)}")

# return None

  

# def _get_all_table_documents(self) -> List[Dict[str, Any]]:

# """Retrieve all documents from table_metadata collection"""

# try:

# cursor = self.table_collection.find({})

# tables = list(cursor)

# print(f"Retrieved {len(tables)} table documents from MongoDB")

# # print(f"Printing Retrieved Table Documents: {tables}")

# return tables

# except Exception as e:

# print(f"Error retrieving table documents: {str(e)}")

# return []

# def _get_all_column_documents(self) -> List[Dict[str, Any]]:

# """Retrieve all documents from column_metadata collection"""

# try:

# cursor = self.column_collection.find({})

# columns = list(cursor)

# print(f"Retrieved {len(columns)} column documents from MongoDB")

# # print(f"Printing Retrieved Column Documents: {columns}")

# return columns

# except Exception as e:

# print(f"Error retrieving column documents: {str(e)}")

# return []

# def _calculate_cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:

# """Calculate cosine similarity between two vectors"""

# try:

# if not vec1 or not vec2 or len(vec1) != len(vec2):

# return 0.0

# vec1 = np.array(vec1)

# vec2 = np.array(vec2)

# # Calculate cosine similarity

# dot_product = np.dot(vec1, vec2)

# norm1 = np.linalg.norm(vec1)

# norm2 = np.linalg.norm(vec2)

# if norm1 == 0 or norm2 == 0:

# return 0.0

# return float(dot_product / (norm1 * norm2))

# except Exception as e:

# print(f" Error calculating cosine similarity: {str(e)}")

# return 0.0

  

# def _remove_conflicts_between_fk_and_pk_relationships(self, table_name: str, foreign_keys: List[Dict], primary_keys: List[Dict]) -> tuple:

# """

# Step 4: Remove conflicts between foreign_keys_referencing_tables and primary_keys_referencing_tables

# If the same table appears in both lists, remove the one with lower confidence or use business logic

# """

# print(f" Step 4: Checking for conflicts between FK and PK relationships for table {table_name}")

# # Step 1: Remove any remaining self-references (double-check)

# print(f" Step 4a: Checking for self-references in {table_name}")

# # Filter foreign keys

# original_fk_count = len(foreign_keys)

# foreign_keys = [fk for fk in foreign_keys if fk.get('target_table_name') != table_name]

# removed_fk = original_fk_count - len(foreign_keys)

# # Filter primary keys

# original_pk_count = len(primary_keys)

# primary_keys = [pk for pk in primary_keys if pk.get('to_table') != table_name]

# removed_pk = original_pk_count - len(primary_keys)

# if removed_fk > 0 or removed_pk > 0:

# print(f" VALIDATION: Removed {removed_fk} self-referencing foreign keys and {removed_pk} self-referencing primary keys")

# # Step 2: Find conflicting relationships (same table in both lists)

# fk_tables = {fk.get('target_table_name') for fk in foreign_keys}

# pk_tables = {pk.get('to_table') for pk in primary_keys}

# conflicts = fk_tables.intersection(pk_tables)

# if conflicts:

# print(f" Step 4b: Found relationship conflicts for table {table_name}")

# print(f" Conflicting tables: {conflicts}")

# # Strategy: Keep the foreign key relationship by default, remove the primary key one

# # This assumes the LLM correctly identified the FK direction

# cleaned_primary_keys = []

# removed_conflicts = 0

# for pk in primary_keys:

# if pk.get('to_table') not in conflicts:

# cleaned_primary_keys.append(pk)

# else:

# print(f" Removed conflicting primary key relationship with {pk.get('to_table')}")

# removed_conflicts += 1

# print(f" CONFLICT RESOLUTION: Resolved {removed_conflicts} conflicting relationships")

# return foreign_keys, cleaned_primary_keys

# print(f" Step 4b: No conflicts found")

# return foreign_keys, primary_keys

  

# def _update_bidirectional_relationships(self, relationships: List[Dict[str, Any]]) -> None:

# """Update bidirectional relationships for all affected tables with conflict prevention"""

# try:

# # Group relationships by target table to avoid duplicates

# processed_pairs = set()

# for relationship in relationships:

# relationship_type = relationship.get('type')

# source_table_name = relationship.get('source_table_name')

# target_table_name = relationship.get('target_table_name')

# linking_column = relationship.get('linking_column', '')

# relation_description = relationship.get('relation_description', '')

# relationship_value = relationship.get('relationship')

# # Create a unique identifier for this relationship pair

# if relationship_type == 'foreign_keys_referencing_tables':

# pair_id = f"{source_table_name}->{target_table_name}:{linking_column}"

# else:

# current_table_name = relationship.get('current_table_name')

# pair_id = f"{source_table_name}->{current_table_name}:{linking_column}"

# # Skip if we've already processed this relationship pair

# if pair_id in processed_pairs:

# print(f" Skipping duplicate relationship: {pair_id}")

# continue

# processed_pairs.add(pair_id)

# if relationship_type == 'foreign_keys_referencing_tables':

# # Update the target table's primary_keys_referencing_tables

# target_table = self.table_collection.find_one({"data.label": target_table_name})

# if target_table:

# current_refs = target_table.get('primary_keys_referencing_tables', [])

# # Check if this reverse relationship already exists

# existing_ref = any(

# ref.get('to_table') == source_table_name and

# ref.get('linking_column') == linking_column

# for ref in current_refs

# )

# if not existing_ref:

# # Create reverse relationship description

# reverse_description = f"Referenced by {source_table_name}: {relation_description}"

# new_ref = {

# 'to_table': source_table_name,

# 'linking_column': linking_column,

# 'relation_description': reverse_description,

# 'relationship': self._invert_relationship_type(relationship_value)

# }

# current_refs.append(new_ref)

# # Log the bidirectional update query

# target_id = target_table.get('data', {}).get('id', '')

# print(f" Bidirectional update for table: {target_table_name} (ID: {target_id})")

# print(f" Adding referencing table: {new_ref}")

# self.table_collection.update_one(

# {"data.label": target_table_name},

# {"$set": {"primary_keys_referencing_tables": current_refs}}

# )

# else:

# print(f" Reverse relationship already exists: {source_table_name} -> {target_table_name}")

# elif relationship_type == 'referencing':

# # Update the source table's foreign_keys_referencing_tables

# source_table = self.table_collection.find_one({"data.label": source_table_name})

# if source_table:

# current_fks = source_table.get('foreign_keys_referencing_tables', [])

# current_table_name = relationship.get('current_table_name')

# # Check if this reverse relationship already exists

# existing_fk = any(

# fk.get('target_table_name') == current_table_name and

# fk.get('linking_column') == linking_column

# for fk in current_fks

# )

# if not existing_fk:

# # Create reverse relationship description

# reverse_description = f"References {current_table_name}: {relation_description}"

# new_fk = {

# 'target_table_name': current_table_name,

# 'linking_column': linking_column,

# 'relation_description': reverse_description,

# 'relationship': self._invert_relationship_type(relationship_value)

# }

# current_fks.append(new_fk)

# # Log the bidirectional update query

# source_id = source_table.get('data', {}).get('id', '')

# print(f" Bidirectional update for table: {source_table_name} (ID: {source_id})")

# print(f" Adding foreign key: {new_fk}")

# self.table_collection.update_one(

# {"data.label": source_table_name},

# {"$set": {"foreign_keys_referencing_tables": current_fks}}

# )

# else:

# print(f" Reverse relationship already exists: {current_table_name} -> {source_table_name}")

# logger.info("[AFTER BIDIRECTIONAL] Completed updates for all affected tables.")

# except Exception as e:

# print(f" Error updating bidirectional relationships: {str(e)}")

  

# def _invert_relationship_type(self, relationship_type: str) -> str:

# """Invert relationship type for bidirectional updates"""

# inversions = {

# "one-to-many": "many-to-one",

# "many-to-one": "one-to-many",

# "one-to-one": "one-to-one",

# "many-to-many": "many-to-many"

# }

# return inversions.get(relationship_type, relationship_type)

  

# def _update_table_relationships(self, table_id: str, foreign_keys_referencing_tables: List[Dict[str, Any]], primary_keys_referencing_tables: List[Dict[str, Any]]) -> bool:

# """Update table document with inferred relationships"""

# try:

# # Get current relationships

# current_table = self.table_collection.find_one({"data.id": table_id})

# if not current_table:

# return False

# # Update document - directly update the existing arrays

# update_doc = {

# "$set": {

# "foreign_keys_referencing_tables": foreign_keys_referencing_tables,

# "primary_keys_referencing_tables": primary_keys_referencing_tables,

# "last_updated_by": "relationship_inference",

# "updated_at": datetime.datetime.utcnow().isoformat() + "Z"

# }

# }

# # Log the update operation

# table_name = current_table.get('data', {}).get('label', table_id)

# print(f" Building update query for table: {table_name} (ID: {table_id})")

# print(f" Query filter: {{'data.id': '{table_id}'}}")

# print(f" Foreign keys count: {len(foreign_keys_referencing_tables)}")

# print(f" Referencing tables count: {len(primary_keys_referencing_tables)}")

# result = self.table_collection.update_one(

# {"data.id": table_id},

# update_doc

# )

# print(f" Update result - Modified count: {result.modified_count}, Matched count: {result.matched_count}")

# return result.matched_count > 0

# except Exception as e:

# print(f" Error updating relationships for table {table_id}: {str(e)}")

# return False

  

# def _find_similar_tables(self, target_table_doc: Dict[str, Any], all_tables: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:

# """Find top K most similar tables using embedding vectors"""

# target_embedding = target_table_doc.get('embedding_vector')

# target_id = target_table_doc.get('data', {}).get('id')

# if not target_embedding or not target_id:

# return []

# similarities = []

# for table_doc in all_tables:

# table_data = table_doc.get('data', {})

# table_id = table_data.get('id')

# table_embedding = table_doc.get('embedding_vector')

# # Skip same table

# if table_id == target_id:

# continue

# if not table_embedding:

# continue

# similarity = self._calculate_cosine_similarity(target_embedding, table_embedding)

# if similarity > 0:

# similarities.append({

# 'table_doc': table_doc,

# 'similarity': similarity,

# 'table_id': table_id,

# 'table_label': table_data.get('label', 'Unknown')

# })

# # Sort by similarity descending and return top K

# similarities.sort(key=lambda x: x['similarity'], reverse=True)

# # Log top K similar tables

# print(f"\n Top {top_k} similar tables for table ID {target_id}:")

# for rank, item in enumerate(similarities[:top_k], 1):

# print(f" {rank}. Table ID: {item['table_id']}, Label: {item['table_label']}, Similarity: {item['similarity']:.4f}")

  

# return [item['table_doc'] for item in similarities[:top_k]]

  

# def _find_similar_columns(self, target_table_doc: Dict[str, Any], all_columns: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:

# """Find top K most similar columns using embedding vectors"""

# target_embedding = target_table_doc.get('embedding_vector')

# target_table_id = target_table_doc.get('data', {}).get('id')

# if not target_embedding or not target_table_id:

# return []

# similarities = []

# for column_doc in all_columns:

# column_data = column_doc.get('data', {})

# column_id = column_data.get('id')

# column_embedding = column_doc.get('embedding_vector')

# parent_id = column_data.get('parent_id')

# # Skip columns from same table

# if parent_id == target_table_id:

# continue

# if not column_embedding:

# continue

# similarity = self._calculate_cosine_similarity(target_embedding, column_embedding)

# if similarity > 0:

# similarities.append({

# 'column_doc': column_doc,

# 'similarity': similarity,

# 'column_id': column_id,

# 'column_label': column_data.get('label', 'Unknown'),

# 'parent_id': parent_id

# })

# # Sort by similarity descending and return top K

# similarities.sort(key=lambda x: x['similarity'], reverse=True)

# # Log top K similar columns

# print(f"\n Top {top_k} similar columns for table ID {target_table_id}:")

# for rank, item in enumerate(similarities[:top_k], 1):

# print(f" {rank}. Column ID: {item['column_id']}, Label: {item['column_label']}, Parent Table ID: {item['parent_id']}, Similarity: {item['similarity']:.4f}")

  

# return [item['column_doc'] for item in similarities[:top_k]]

  

# async def process_relationship_inference(self):

# """Process relationship inference for all tables (TASK 2)"""

# print("\n" + "="*60)

# print("TASK 2: Starting relationship inference...")

# print("="*60)

# # Get all table and column documents with embeddings

# print("Loading all table and column documents...")

# all_tables = [doc for doc in self._get_all_table_documents() if doc.get('embedding_vector')]

# all_columns = [doc for doc in self._get_all_column_documents() if doc.get('embedding_vector')]

# if not all_tables:

# print("No tables with embeddings found for relationship inference")

# return False

# print(f"Found {len(all_tables)} tables and {len(all_columns)} columns with embeddings")

# total_tables = len(all_tables)

# processed_tables = 0

# total_relationships_added = 0

# all_bidirectional_updates = []

# for idx, target_table in enumerate(all_tables, 1):

# target_data = target_table.get('data', {})

# table_id = target_data.get('id')

# table_name = target_data.get('label', 'Unknown')

# print(f"\nProcessing table {idx}/{total_tables}: {table_name} (ID: {table_id})")

# # STEP 1: Find referencing tables using exact primary key matching

# print(f" STEP 1: Finding referencing tables using exact key matching...")

# key_matched_referencing_tables = self._find_referencing_tables_by_key_matching(target_table)

# # STEP 2: Find columns semantically similar to target table's PRIMARY KEYS

# print(f" STEP 2: Finding columns semantically similar to primary keys...")

# semantic_similar_tables_pk = self._find_similar_columns_to_primary_keys(target_table, all_columns, top_k=5)

# # STEP 3: Merge key-matched and semantic tables for primary keys and remove duplicates

# print(f" STEP 3: Merging and deduplicating tables for primary key relationships...")

# merged_tables_for_primary_keys = self._merge_and_deduplicate_primary_key_tables(

# key_matched_referencing_tables,

# semantic_similar_tables_pk,

# table_id

# )

# # Find semantic foreign key relationships

# print(f" Finding foreign key relationships using semantic similarity...")

# semantic_similar_tables_fk = self._find_similar_columns_for_foreign_keys(target_table, all_columns, top_k=5)

# # Find general similar columns for additional context

# print(f" Finding similar columns for additional context...")

# similar_columns = self._find_similar_columns(target_table, all_columns, top_k=5)

  

# if not merged_tables_for_primary_keys and not semantic_similar_tables_fk and not similar_columns:

# print(f" No similar entities found for table {table_id}")

# continue

# # Query LLM for relationship inference

# print(f" STEP 4: Querying LLM for relationship inference...")

# # Create user prompt with both PK and FK tables

# user_prompt = self._create_relationship_user_prompt(

# target_table,

# merged_tables_for_primary_keys,

# semantic_similar_tables_fk,

# similar_columns

# )

# llm_response = await _query_llm(self.llm, self._create_relationship_inference_prompt(), user_prompt)

# print(f" LLM response received for table {table_name}")

# if not llm_response:

# print(f" Failed to get LLM response for table {table_id}")

# continue

# # Parse LLM response

# parsed_relationships = self._parse_llm_response(llm_response, table_name)

# if not parsed_relationships:

# print(f" Failed to parse LLM response for table {table_id}")

# continue

# # Extract relationships

# foreign_keys_referencing_tables = parsed_relationships.get("foreign_keys_referencing_tables", []) or []

# primary_keys_referencing_tables = parsed_relationships.get("primary_keys_referencing_tables", []) or []

# # Convert to list if single object

# if isinstance(foreign_keys_referencing_tables, dict):

# foreign_keys_referencing_tables = [foreign_keys_referencing_tables]

# if isinstance(primary_keys_referencing_tables, dict):

# primary_keys_referencing_tables = [primary_keys_referencing_tables]

# # STEP 4: Remove conflicts between FK and PK relationships

# print(f" STEP 4: Removing conflicts and validating relationships...")

# foreign_keys_referencing_tables, primary_keys_referencing_tables = self._remove_conflicts_between_fk_and_pk_relationships(

# table_name, foreign_keys_referencing_tables, primary_keys_referencing_tables

# )

  

# # Ensure relationship types exist

# for rel in foreign_keys_referencing_tables:

# if not rel.get("relationship"):

# rel["relationship"] = self._infer_relationship_type(

# rel.get("relation_description", ""),

# is_foreign_key=True

# )

  

# for rel in primary_keys_referencing_tables:

# if not rel.get("relationship"):

# rel["relationship"] = self._infer_relationship_type(

# rel.get("relation_description", ""),

# is_foreign_key=False

# )

  

# logger.info(f"[BEFORE BIDIRECTIONAL] Table: {table_name} (ID: {table_id})")

# logger.info("Foreign Keys: %s", json.dumps(foreign_keys_referencing_tables, indent=2))

# logger.info("Primary Keys: %s", json.dumps(primary_keys_referencing_tables, indent=2))

# # Update table relationships

# success = self._update_table_relationships(table_id, foreign_keys_referencing_tables, primary_keys_referencing_tables)

# if success:

# processed_tables += 1

# relationships_count = len(foreign_keys_referencing_tables) + len(primary_keys_referencing_tables)

# total_relationships_added += relationships_count

# print(f" Updated {relationships_count} relationships for table {table_name}")

# # Prepare bidirectional updates

# for fk in foreign_keys_referencing_tables:

# all_bidirectional_updates.append({

# 'type': 'foreign_keys_referencing_tables',

# 'source_table_name': table_name,

# 'target_table_name': fk.get('target_table_name'),

# 'linking_column': fk.get('linking_column', ''),

# 'relation_description': fk.get('relation_description', ''),

# 'relationship': fk.get('relationship')

# })

# for ref in primary_keys_referencing_tables:

# all_bidirectional_updates.append({

# 'type': 'referencing',

# 'source_table_name': ref.get('to_table'),

# 'current_table_name': table_name,

# 'linking_column': ref.get('linking_column', ''),

# 'relation_description': ref.get('relation_description', ''),

# 'relationship': ref.get('relationship')

# })

# else:

# print(f" Failed to update relationships for table {table_name}")

# # Process bidirectional updates

# if all_bidirectional_updates:

# print(f"\nProcessing {len(all_bidirectional_updates)} bidirectional relationship updates...")

# self._update_bidirectional_relationships(all_bidirectional_updates)

# print(" Bidirectional relationships updated")

# print(f"\n{'='*50}")

# print(f"TASK 2 COMPLETE: Relationship inference finished!")

# print(f"Tables processed: {processed_tables}/{total_tables}")

# print(f"Total relationships added: {total_relationships_added}")

# print(f"{'='*50}")

# return processed_tables > 0

# def _infer_relationship_type(self, description: str, is_foreign_key: bool) -> str:

# """Robust relationship type inference from description"""

# if not description:

# return "many-to-one" if is_foreign_key else "one-to-many"

# desc_lower = description.lower()

# # Direct pattern matching

# patterns = {

# "one-to-one": "one-to-one",

# "1:1": "one-to-one",

# "one-to-many": "one-to-many",

# "1:m": "one-to-many",

# "many-to-one": "many-to-one",

# "m:1": "many-to-one",

# "many-to-many": "many-to-many",

# "m:n": "many-to-many"

# }

# for pattern, rel_type in patterns.items():

# if pattern in desc_lower:

# return rel_type

# # Context-based inference

# if "references" in desc_lower or "foreign key" in desc_lower:

# return "many-to-one" if is_foreign_key else "one-to-many"

# if "referenced by" in desc_lower or "points to" in desc_lower:

# return "one-to-many" if is_foreign_key else "many-to-one"

# # Default based on relationship category

# return "many-to-one" if is_foreign_key else "one-to-many"

  
  

# async def run_relationship_inference_task():

# """TASK 2: Run relationship inference only"""

# print("Starting Relationship Inference Task...")

# print("="*60)

# config = Config()

# processor = RelationshipInference(config)

# try:

# success = await processor.process_relationship_inference()

# if success:

# print("Relationship inference task completed successfully!")

# else:

# print("Relationship inference task completed but no relationships were inferred!")

# return success

# except Exception as e:

# print(f"Error in relationship inference task: {str(e)}")

# return False

# finally:

# if hasattr(processor, 'client') and processor.client:

# processor.client.close()
```

