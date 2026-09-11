// API 配置
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export async function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${API_BASE_URL}${path}`, { credentials: 'include', ...init });
}
