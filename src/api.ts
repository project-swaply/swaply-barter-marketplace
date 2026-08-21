const API_URL = (import.meta.env.VITE_API_URL || 'https://swaply-api-e3vc.onrender.com').replace(/\/$/, '');

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Swaply-Client': 'web', ...options.headers },
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Unable to complete this request');
  return data as T;
}
