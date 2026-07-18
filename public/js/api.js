// バックエンドAPIの薄いラッパー
async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  // オリジナル楽譜
  listScores: () => jsonFetch('/api/scores'),
  getScore: (id) => jsonFetch(`/api/scores/${id}`),
  createScore: (data) => jsonFetch('/api/scores', { method: 'POST', body: JSON.stringify(data) }),
  updateScore: (id, data) => jsonFetch(`/api/scores/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteScore: (id) => jsonFetch(`/api/scores/${id}`, { method: 'DELETE' }),

  // アップロード楽譜
  listDocuments: () => jsonFetch('/api/documents'),
  getDocument: (id) => jsonFetch(`/api/documents/${id}`),
  uploadDocument: async (formData) => {
    const res = await fetch('/api/documents', { method: 'POST', body: formData });
    if (!res.ok) {
      let msg = `${res.status}`;
      try { msg = (await res.json()).error || msg; } catch { /* noop */ }
      throw new Error(msg);
    }
    return res.json();
  },
  updateDocument: (id, data) => jsonFetch(`/api/documents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDocument: (id) => jsonFetch(`/api/documents/${id}`, { method: 'DELETE' }),
  documentFileUrl: (id) => `/api/documents/${id}/file`,
};
