export interface Project {
  id: string;
  name: string;
  description?: string;
  gitlab_url?: string;
  gitlab_project_path?: string;
  default_format: "BDD" | "MANUAL" | "BOTH";
  llm_model: string;
  llm_provider: string;
  llm_api_url?: string;
  llm_api_key_set: boolean;
  embedding_provider?: string;
  embedding_model?: string;
  embedding_api_key_set: boolean;
  custom_instructions?: string;
  label_include?: string;
  label_exclude?: string;
  issue_state: string;
  max_issues: number;
  detail_level: string;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  project_id: string;
  filename: string;
  original_filename: string;
  file_type: string;
  file_size_bytes: number;
  chunk_count: number;
  status: "PENDING" | "INDEXING" | "INDEXED" | "FAILED";
  error_message?: string;
  uploaded_at: string;
}

export interface DocumentStats {
  document_count: number;
  indexed_count: number;
  total_chunks: number;
  embedding_model: string;
  vector_store: string;
}

export interface Requirement {
  id: string;
  project_id: string;
  gitlab_issue_id?: number;
  gitlab_issue_url?: string;
  title: string;
  description?: string;
  labels?: string;
  assignee?: string;
  milestone?: string;
  fetched_at: string;
}

export interface TestCase {
  id: string;
  requirement_id: string;
  title: string;
  format: "BDD" | "MANUAL";
  content: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  tags?: string;
  scenario_type?: "positive" | "negative" | "edge" | "security" | "performance";
  edited: boolean;
  created_at: string;
  updated_at: string;
}

export interface GenerationJob {
  id: string;
  requirement_id: string;
  celery_task_id?: string;
  status: "PENDING" | "RUNNING" | "COMPLETE" | "FAILED";
  format: string;
  count_hint: string;
  progress_message?: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

export interface GitLabConnectionResult {
  connected: boolean;
  project_name?: string;
  open_issues_count?: number;
  error?: string;
}

export interface UsageBreakdown {
  provider: string;
  model: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

export interface ProjectUsageSummary {
  project_id: string;
  llm: UsageBreakdown;
  embedding: UsageBreakdown;
  total_estimated_cost_usd: number;
}
