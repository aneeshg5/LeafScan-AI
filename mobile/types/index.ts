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
