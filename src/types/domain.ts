export interface Asset {
  id: string;
  type: string;
  name: string;
  owner?: string;
  description?: string;
  source?: string;
  version?: string;
  enabled?: boolean;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Agent {
  id: string;
  name: string;
  kind?: string;
  status?: string;
  model?: string;
  base_url?: string;
  last_seen?: string;
  updated_at?: string;
  meta?: Record<string, unknown>;
}

export interface Dashboard {
  id: string;
  name: string;
  url?: string;
  category?: string;
  status?: string;
  icon?: string;
  owner?: string;
  updated_at?: string;
}

export interface MemoryFact {
  id: string;
  key: string;
  value: string;
  scope?: string;
  source?: string;
  updated_at?: string;
}

export interface ProcessRecord {
  id: string;
  slug?: string;
  title: string;
  body?: string;
  description?: string;
  owner?: string;
  status?: string;
  tags?: string[];
  updated_at?: string;
}

export interface KnowledgeResult {
  source: string;
  title?: string;
  snippet?: string;
  url?: string;
  score?: number;
}

export interface InventoryResponse {
  items?: Asset[];
  data?: Asset[];
  _all?: Asset[];
  total?: number;
  count?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  summary?: {
    stale: number;
    activeMcp: number;
    byType: Record<string, number>;
  };
}
