---
"@cartesi/sdk": patch
---

bump telegraf to 1.40.3. Note for operators: telegraf 1.40.0 removed the deprecated aerospike and sflow inputs, the amon output, procstat's deprecated options, tail's from_beginning and kafka_consumer's connection_strategy, and 1.39.0 sets an explicit minimum TLS version; a telegraf configuration relying on any of those stops loading.
