import { t } from './i18n.js';

let token = null;
try { token = localStorage.getItem('kb-token'); } catch (_) {}

export const auth = {
  get token() { return token; },
  set(t) { token = t; try { t ? localStorage.setItem('kb-token', t) : localStorage.removeItem('kb-token'); } catch (_) {} },
};

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try { res = await fetch('/api' + path, { method, headers, body: payload }); }
  catch { throw Object.assign(new Error(t('Tidak bisa terhubung ke server.')), { status: 0 }); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(t(data.message || 'Terjadi kesalahan.')), { status: res.status });
  return data;
}

const qs = (o) => { const p = new URLSearchParams(); Object.entries(o).forEach(([k, v]) => v !== undefined && v !== '' && v !== null && p.set(k, v)); const s = p.toString(); return s ? '?' + s : ''; };

export const api = {
  login: (b) => request('/auth/login', { method: 'POST', body: b }),
  register: (b) => request('/auth/register', { method: 'POST', body: b }),
  me: () => request('/auth/me'),
  updateBio: (bio) => request('/auth/me', { method: 'PUT', body: { bio } }),
  news: (o) => request('/news' + qs(o)),
  trending: () => request('/news/trending'),
  stats: () => request('/news/stats'),
  article: (id) => request(`/news/${id}`),
  view: (id) => request(`/news/${id}/view`, { method: 'POST' }),
  like: (id) => request(`/news/${id}/like`, { method: 'POST' }),
  bookmark: (id) => request(`/news/${id}/bookmark`, { method: 'POST' }),
  share: (id) => request(`/news/${id}/share`, { method: 'POST' }),
  create: (form) => request('/news', { method: 'POST', form }),
  update: (id, form) => request(`/news/${id}`, { method: 'PUT', form }),
  remove: (id) => request(`/news/${id}`, { method: 'DELETE' }),
  comments: (id) => request(`/comments/news/${id}`),
  addComment: (id, content) => request(`/comments/news/${id}`, { method: 'POST', body: { content } }),
  delComment: (id) => request(`/comments/${id}`, { method: 'DELETE' }),
  translate: (texts) => request('/translate', { method: 'POST', body: { texts, target: 'en' } }),
  user: (name) => request(`/users/${encodeURIComponent(name)}`),
};
