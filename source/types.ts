export interface TableTarget {
  topic: string
  partitionKey: string
}

export interface TableConfig {
  schema: string
  table: string
  targets: TableTarget[]
}
