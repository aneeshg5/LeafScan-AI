export interface PredictResponse {
  scan_id: string;
  disease_name: string;
  is_healthy: boolean;
  confidence: number;
  severity: string | null;
  description: string;
  treatments: string[];
  plant_type: string;
  created_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Field {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Plant {
  id: string;
  user_id: string;
  field_id: string | null;
  latitude: number;
  longitude: number;
  plant_type: string | null;
  nickname: string | null;
  created_at: string;
  last_scanned_at: string | null;
}

export interface Scan {
  id: string;
  user_id: string;
  plant_id: string | null;
  image_url: string;
  disease_name: string;
  is_healthy: boolean;
  confidence: number;
  severity: string | null;
  plant_type: string;
  description: string;
  treatments: string[];
  source: 'mobile' | 'drone' | 'gallery';
  created_at: string;
  deleted_at: string | null;
}

export interface ChatSession {
  id: string;
  user_id: string;
  plant_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  label: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}
