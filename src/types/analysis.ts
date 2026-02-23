export type SampleSize = "small" | "medium" | "full";

export interface TopValue {
  value: string;
  count: number;
  percentage: number;
}

export interface ColumnStat {
  name: string;
  dataType: string;
  totalRows: number;
  nonNullCount: number;
  nullCount: number;
  distinctCount: number;
  // Numeric columns only
  minValue?: number;
  maxValue?: number;
  avgValue?: number;
  stddev?: number;
  // Top value frequencies
  topValues: TopValue[];
}

export interface DistributionResult {
  tableName: string;
  sampleSize: SampleSize;
  actualRowsScanned: number;
  columns: ColumnStat[];
}

export interface IndexColumn {
  name: string;
  isIncluded: boolean;
  keyOrdinal: number;
}

export interface IndexInfo {
  indexName: string;
  indexId: number;
  type: string;
  isUnique: boolean;
  isPrimaryKey: boolean;
  isDisabled: boolean;
  filterDefinition: string | null;
  columns: IndexColumn[];
  sizeGB?: number;
}

export interface IndexUsageStat {
  indexName: string;
  indexId: number;
  userSeeks: number;
  userScans: number;
  userLookups: number;
  userUpdates: number;
  lastUserSeek: string | null;
  lastUserScan: string | null;
  lastUserLookup: string | null;
}

export interface MissingIndex {
  improvementMeasure: number;
  avgTotalCost: number;
  avgUserImpact: number;
  userSeeks: number;
  userScans: number;
  equalityColumns: string | null;
  inequalityColumns: string | null;
  includedColumns: string | null;
  suggestedDDL: string;
}
