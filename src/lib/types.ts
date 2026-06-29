// Shared domain types for calls-api.

export type AppRole = "super_admin" | "admin" | "agent";

export interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  // Company email domain enforced for agents created by this admin (null for
  // super-admins / legacy accounts). Surfaced by the API on user rows.
  company_domain?: string | null;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  api_type: string;
  endpoint: string;
  status: string;
  credits_used: number;
  request_data: Record<string, unknown> | null;
  response_data: Record<string, unknown> | null;
  created_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  key_name: string;
  api_key: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export interface Lead {
  id: string;
  user_id: string;
  caller_number: string;
  caller_state: string;
  caller_zip: string;
  returned_did: string | null;
  api_response: Record<string, unknown> | null;
  status: string;
  created_at: string;
}
