**foreign_keys_referencing_tables** describes the tables that the current table is **referencing** by means of its own columns (which act as foreign keys).

Let's use your example with the **Order** table:

- Suppose the **Order** table has a primary key called `order_id`.
    
- If **another table**, like **OrderItems**, has a column named `order_id` that points to the Order table's `order_id`, then:
    
    - For **Order**, the **primary_keys_referencing_tables** list would include **OrderItems** (because OrderItems references Order).
        
    - For **OrderItems**, the **foreign_keys_referencing_tables** list would include **Order** (because OrderItems has a foreign key to Order).
        

## So specifically:

- **foreign_keys_referencing_tables** means: "Which tables am I (the current table) pointing to using one or more of my columns as foreign keys?"
    
    - Example: The **OrderItems** table might say, "I have a foreign key to Order (`order_id`) and to Product (`product_id`). So my foreign_keys_referencing_tables: [Order, Product]".
        
- **primary_keys_referencing_tables** means: "Which tables have columns that point to _my_ primary key?"
    
    - Example: The **Order** table might say, "OrderItems has a foreign key to me (`order_id`), so my primary_keys_referencing_tables: [OrderItems]".
        

## Important:

- It's **not just about the primary key column**, but about **any column(s) in the current table that act as foreign keys to another table**.
    
- Usually, these are columns like `customer_id`, `order_id`, `product_id`, etc., that point to **primary keys** in other tables.
    

**Summary:**

- In the **foreign_keys_referencing_tables** list, you record: "Which other tables do my columns (usually called foreign keys) reference?"
    
- It's always based on your own table's columns (foreign keys), not on which tables contain your primary key somewhere (that's primary_keys_referencing_tables for the other table).