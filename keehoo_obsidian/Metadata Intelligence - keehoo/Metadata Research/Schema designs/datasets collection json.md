# `datasets` collection

```json
{
  "_id": {
    "$oid": "6970bc168effe5b8047b8705"
  },
  "dataset_id": "cust_support_calls",
  "business_name": "Customer Support Calls",
  "domain": "Customer Support",
  "entity_type": "interaction",
  "grain": "per_call",
  "modality": "audio",
  "lifecycle_stage": "raw",
  "is_observed": true,
  "sensitivity": "PII",
  "owner": "Support Ops",
  "sample_values": [
    "123",
    "3254",
    "23424"
  ]
}
```
# `dataset_fields` collection

```json
{
  "_id": {
    "$oid": "6970c0848effe5b8047b870e"
  },
  "dataset_id": "cust_support_calls",
  "field_name": "call_duration_seconds",
  "business_name": "Call Duration",
  "logical_type": "metric",
  "unit": "seconds",
  "is_aggregatable": true,
  "sensitivity": "public"
}
```

# `dataset_processing` collection

```json
{
  "_id": {
    "$oid": "6970bc598effe5b8047b8707"
  },
  "dataset_id": "cust_support_calls",
  "processing_type": "batch",
  "frequency": "hourly",
  "retention_hours": 720,
  "late_arrival_policy": "accept"
}
```

# `dataset_quality` collection

```json
{
  "_id": {
    "$oid": "6970c0aa8effe5b8047b8710"
  },
  "dataset_id": "cust_support_calls",
  "freshness_minutes": 60,
  "availability_pct": 99.8,
  "quality_score": 0.92
}
```

# `dataset_relationship` collection

```json
{
  "_id": {
    "$oid": "6970c3378effe5b8047b872a"
  },
  "from_dataset": "ecom_cart_events",
  "to_dataset": "ecom_orders",
  "relationship": "derives_from",
  "description": "Orders created from finalized shopping carts"
}
```

# `ml_outputs` collection

```json
{
  "_id": {
    "$oid": "6970c3258effe5b8047b8728"
  },
  "dataset_id": "ecom_orders",
  "prediction_type": "fraud_risk",
  "prediction_value": "high",
  "model": "fraud_detection_v2",
  "confidence": 0.89,
  "prediction_ts": "2026-01-20T12:05:00Z",
  "is_observed": false
}
```




# `unified metadata supporting all the formats` collection.

```json
{
  "_id": "cust_support_calls",

  "identity": {
    "dataset_id": "cust_support_calls",
    "business_name": "Customer Support Calls",
    "description": "Audio recordings and metrics for customer support calls",
    "domain": "Customer Support",
    "entity_type": "interaction",
    "grain": "per_call",
    "modality": "audio",
    "lifecycle_stage": "raw",
    "is_observed": true
  },

  "governance": {
    "owner": "Support Ops",
    "sensitivity": "PII",
    "retention_policy": {
      "retention_hours": 720
    }
  },

  "schema": {
    "fields": [
      {
        "field_name": "call_duration_seconds",
        "business_name": "Call Duration",
        "logical_type": "metric",
        "physical_type": "integer",
        "unit": "seconds",
        "is_aggregatable": true,
        "sensitivity": "public"
      }
    ],

    "sample_values": [
      "123",
      "3254",
      "23424"
    ]
  },

  "processing": {
    "processing_type": "batch",
    "frequency": "hourly",
    "late_arrival_policy": "accept"
  },

  "quality": {
    "freshness_minutes": 60,
    "availability_pct": 99.8,
    "quality_score": 0.92,
    "last_evaluated_ts": "2026-01-20T12:00:00Z"
  },

  "lineage": {
    "upstream": [
      {
        "dataset_id": "ecom_cart_events",
        "relationship": "derives_from",
        "description": "Orders created from finalized shopping carts"
      }
    ],
    "downstream": []
  },

  "ml_semantics": {
    "produces_predictions": false,
    "predictions": []
  },

  "observability": {
    "created_ts": "2026-01-01T00:00:00Z",
    "last_updated_ts": "2026-01-20T12:10:00Z",
    "version": 1
  }
}
```



