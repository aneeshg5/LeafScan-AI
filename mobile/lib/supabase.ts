import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1800;

const secureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const countStr = await SecureStore.getItemAsync(`${key}_count`);
      if (countStr === null) {
        return SecureStore.getItemAsync(key);
      }
      const count = parseInt(countStr, 10);
      const chunks: string[] = [];
      for (let i = 0; i < count; i++) {
        const chunk = await SecureStore.getItemAsync(`${key}_${i}`);
        if (chunk === null) return null;
        chunks.push(chunk);
      }
      return chunks.join('');
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    const count = Math.ceil(value.length / CHUNK_SIZE);
    await SecureStore.setItemAsync(`${key}_count`, String(count));
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(
        `${key}_${i}`,
        value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      );
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      const countStr = await SecureStore.getItemAsync(`${key}_count`);
      if (countStr !== null) {
        const count = parseInt(countStr, 10);
        for (let i = 0; i < count; i++) {
          await SecureStore.deleteItemAsync(`${key}_${i}`).catch(() => {});
        }
        await SecureStore.deleteItemAsync(`${key}_count`).catch(() => {});
      }
      await SecureStore.deleteItemAsync(key).catch(() => {});
    } catch {
    }
  },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
