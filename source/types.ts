export interface TargetMatch {
  or?: string[]
  and?: string[]
}

export interface TableTarget {
  topic: string
  partitionKey: string
  match?: TargetMatch
}

export interface TableConfig {
  schema: string
  table: string
  targets: TableTarget[]
}
