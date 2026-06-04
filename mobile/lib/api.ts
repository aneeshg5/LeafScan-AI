import type { ApiKey, PredictResponse } from '../types';
import { supabase } from './supabase';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.0.85:8000';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function postPredict(imageUri: string, plantId?: string | null): Promise<PredictResponse> {
  const filename = imageUri.split('/').pop() ?? 'photo.jpg';
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

  const body = new FormData();
  body.append('file', { uri: imageUri, name: filename, type: mimeType } as unknown as Blob);

  const url = plantId ? `${BASE_URL}/predict?plant_id=${plantId}` : `${BASE_URL}/predict`;
  const headers = await authHeaders();
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`Predict failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<PredictResponse>;
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}/api-keys`, { headers });
  if (!res.ok) throw new Error(`listApiKeys failed (${res.status})`);
  return res.json();
}

export async function createApiKey(label: string): Promise<{ id: string; label: string; created_at: string; key: string }> {
  const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' };
  const res = await fetch(`${BASE_URL}/api-keys`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ label }),
  });
  if (!res.ok) throw new Error(`createApiKey failed (${res.status})`);
  return res.json();
}

export async function revokeApiKey(id: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}/api-keys/${id}`, { method: 'DELETE', headers });
  if (!res.ok && res.status !== 404) throw new Error(`revokeApiKey failed (${res.status})`);
}
