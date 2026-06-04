import type { PredictResponse } from '../types';

const cache = new Map<string, PredictResponse>();

export function setResult(id: string, result: PredictResponse) {
  cache.set(id, result);
}

export function getResult(id: string): PredictResponse | undefined {
  return cache.get(id);
}

export function clearResult(id: string) {
  cache.delete(id);
}
