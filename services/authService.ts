import { API_BASE_URL } from './config';

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include', ...init });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload.error || '请求失败');
  return payload.data;
}

export const authService = {
  login(password: string) {
    return request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  },
  session() {
    return request('/auth/session');
  },
  logout() {
    return request('/auth/logout', { method: 'POST' });
  },
};
