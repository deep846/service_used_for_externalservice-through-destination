import React, { useEffect, useMemo, useRef, useState } from 'react';
import './StudentFeed.css';

export default function StudentFeed() {
  // ─── Data + UI state ────────────────────────────────────────────────────────
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState({ key: 'Id', dir: 'asc' });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Modal (create/edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
  const [modalData, setModalData] = useState({ Id: '', name: '' });
  const [modalErr, setModalErr] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [confirm, setConfirm] = useState({ open: false, id: null, name: '' });
  const [deletingId, setDeletingId] = useState(null);

  // Toast
  const [toast, setToast] = useState('');
  const toastTimer = useRef();

  const controllerRef = useRef();

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const showToast = (t) => {
    clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  };

  async function fetchCsrfToken() {
    try {
      const res = await fetch('/odata/v4/student/student', {
        method: 'GET',
        headers: { 'x-csrf-token': 'fetch' },
        credentials: 'include'
      });
      return res.headers.get('x-csrf-token');
    } catch {
      return null;
    }
  }

  async function load() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError('');
    try {
      const res = await fetch('/odata/v4/student/student', {
        signal: controller.signal, credentials: 'include'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: failed to load`);
      const data = await res.json();
      setRows(Array.isArray(data.value) ? data.value : []);
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    return () => controllerRef.current?.abort();
  }, []);

  // ─── Filter + sort + paginate ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? rows.filter(r =>
          String(r.Id).toLowerCase().includes(q) ||
          String(r.name || '').toLowerCase().includes(q)
        )
      : rows.slice();

    list.sort((a, b) => {
      const A = a[sortBy.key];
      const B = b[sortBy.key];
      if (A == null && B != null) return sortBy.dir === 'asc' ? -1 : 1;
      if (A != null && B == null) return sortBy.dir === 'asc' ? 1 : -1;
      if (A == null && B == null) return 0;
      if (typeof A === 'string' && typeof B === 'string') {
        return sortBy.dir === 'asc' ? A.localeCompare(B) : B.localeCompare(A);
      }
      return sortBy.dir === 'asc' ? (A > B ? 1 : A < B ? -1 : 0)
                                  : (A < B ? 1 : A > B ? -1 : 0);
    });
    return list;
  }, [rows, query, sortBy]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const curPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((curPage - 1) * pageSize, curPage * pageSize);

  // ─── CRUD: Open modals ──────────────────────────────────────────────────────
  function openCreate() {
    setModalMode('create');
    setModalData({ Id: '', name: '' });
    setModalErr('');
    setModalOpen(true);
  }

  function openEdit(row) {
    setModalMode('edit');
    setModalData({ Id: row.Id, name: row.name || '' });
    setModalErr('');
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setModalErr('');
  }

  function validateModal() {
    const { Id, name } = modalData;
    const idNum = Number(Id);
    if (modalMode === 'create') {
      if (!Id || Number.isNaN(idNum) || idNum <= 0) return 'ID must be a positive number.';
      if (rows.some(r => String(r.Id) === String(Id))) return `ID ${Id} already exists.`;
    }
    if (!name || name.trim().length < 2) return 'Name must be at least 2 characters.';
    return '';
  }

  // ─── CRUD: Create/Update ────────────────────────────────────────────────────
  async function saveModal(e) {
    e.preventDefault();
    const v = validateModal();
    if (v) { setModalErr(v); return; }

    setSaving(true);
    try {
      const token = await fetchCsrfToken();
      if (modalMode === 'create') {
        const payload = { Id: Number(modalData.Id), name: modalData.name.trim() };
        const res = await fetch('/odata/v4/student/student', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'prefer': 'return=representation',
            ...(token ? { 'x-csrf-token': token } : {})
          },
          body: JSON.stringify(payload),
          credentials: 'include'
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`Create failed: HTTP ${res.status}${t ? ` – ${t}` : ''}`);
        }
        const created = await res.json().catch(() => null);
        if (created?.Id != null) {
          created.__new = true;
          setRows(prev => [created, ...prev]);
          setTimeout(() => setRows(prev => prev.map(p => ({ ...p, __new: false }))), 1500);
        } else {
          await load();
        }
        showToast('Student created ✅');
      } else {
        const keyPath = `/odata/v4/student/student(${encodeURIComponent(modalData.Id)})`;
        const old = rows;
        setRows(prev => prev.map(r => String(r.Id) === String(modalData.Id) ? { ...r, name: modalData.name } : r));

        const res = await fetch(keyPath, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'prefer': 'return=representation',
            'if-match': '*',
            ...(token ? { 'x-csrf-token': token } : {})
          },
          body: JSON.stringify({ name: modalData.name.trim() }),
          credentials: 'include'
        });
        if (!res.ok) {
          setRows(old); // rollback
          const t = await res.text();
          throw new Error(`Update failed: HTTP ${res.status}${t ? ` – ${t}` : ''}`);
        }
        const updated = await res.json().catch(() => null);
        if (updated?.Id != null) {
          setRows(prev => prev.map(r => String(r.Id) === String(updated.Id) ? updated : r));
        }
        showToast('Student updated ✨');
      }
      setModalOpen(false);
      setModalErr('');
    } catch (err) {
      setModalErr(err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  // ─── CRUD: Delete ───────────────────────────────────────────────────────────
  function askDelete(row) {
    setConfirm({ open: true, id: row.Id, name: row.name || '' });
  }
  function closeConfirm() { setConfirm({ open: false, id: null, name: '' }); }

  async function doDelete() {
    const id = confirm.id;
    if (id == null) return;
    setDeletingId(id);
    try {
      const token = await fetchCsrfToken();
      const res = await fetch(`/odata/v4/student/student(${encodeURIComponent(id)})`, {
        method: 'DELETE',
        headers: {
          'if-match': '*',
          ...(token ? { 'x-csrf-token': token } : {})
        },
        credentials: 'include'
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Delete failed: HTTP ${res.status}${t ? ` – ${t}` : ''}`);
      }
      setRows(prev => prev.filter(r => String(r.Id) !== String(id)));
      showToast('Student deleted 🗑️');
      closeConfirm();
    } catch (err) {
      showToast(err.message || 'Failed to delete.');
    } finally {
      setDeletingId(null);
    }
  }

  // ─── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div className="fx-root">
      {/* funky header */}
      <header className="fx-header">
        <div className="fx-title">
          <h1>Student Pulse</h1>
          <p>CRUD on one OData endpoint • <span>{rows.length}</span> total</p>
        </div>

        <div className="fx-toolbar">
          <div className="fx-search">
            <span className="fx-icon fx-i-search" />
            <input
              value={query}
              onChange={(e) => { setPage(1); setQuery(e.target.value); }}
              placeholder="Search by name or ID…"
              aria-label="Search students"
            />
            {query && (
              <button className="fx-clear" onClick={() => setQuery('')} title="Clear">×</button>
            )}
          </div>

          <div className="fx-sort">
            <label>Sort</label>
            <select
              value={`${sortBy.key}:${sortBy.dir}`}
              onChange={(e) => {
                const [key, dir] = e.target.value.split(':');
                setSortBy({ key, dir });
              }}
            >
              <option value="Id:asc">ID ↑</option>
              <option value="Id:desc">ID ↓</option>
              <option value="name:asc">Name ↑</option>
              <option value="name:desc">Name ↓</option>
            </select>
          </div>

          <button className="fx-btn" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {/* error banner */}
      {error && (
        <div className="fx-alert" role="alert">
          <strong>Load error:</strong> {error}
          <button className="fx-link" onClick={load}>Try again</button>
        </div>
      )}

      {/* grid of funky cards */}
      <main className="fx-grid">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <article key={`skel-${i}`} className="fx-card fx-skel">
              <div className="fx-id skel-block" />
              <div className="fx-name skel-block" />
              <div className="fx-actions">
                <span className="fx-icon fx-i-pen skel-dot" />
                <span className="fx-icon fx-i-trash skel-dot" />
              </div>
            </article>
          ))
        ) : pageRows.length === 0 ? (
          <div className="fx-empty">
            <div className="fx-emoji">🪄</div>
            <div>No results. Try a different search.</div>
          </div>
        ) : (
          pageRows.map(r => (
            <article key={r.Id} className={`fx-card ${r.__new ? 'fx-new' : ''}`}>
              <div className="fx-id"><span className="fx-badge">#{r.Id}</span></div>
              <div className="fx-name" title={r.name}>{r.name}</div>
              <div className="fx-actions">
                <button className="fx-icon-btn" title="Edit" onClick={() => openEdit(r)}>
                  <span className="fx-icon fx-i-pen" />
                </button>
                <button className="fx-icon-btn danger" title="Delete" onClick={() => askDelete(r)}>
                  <span className="fx-icon fx-i-trash" />
                </button>
              </div>
            </article>
          ))
        )}
      </main>

      {/* pagination */}
      <footer className="fx-footer">
        <div className="fx-pager">
          <button className="fx-btn" onClick={() => setPage(1)} disabled={curPage === 1}>« First</button>
          <button className="fx-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={curPage === 1}>‹ Prev</button>
          <span>Page {curPage}/{pageCount}</span>
          <button className="fx-btn" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={curPage === pageCount}>Next ›</button>
          <button className="fx-btn" onClick={() => setPage(pageCount)} disabled={curPage === pageCount}>Last »</button>
        </div>
        <div className="fx-pagesize">
          <label>Rows</label>
          <select value={pageSize} onChange={(e) => { setPage(1); setPageSize(Number(e.target.value)); }}>
            {[6, 12, 24, 48].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </footer>

      {/* Floating Add button */}
      <button className="fx-fab" onClick={openCreate} title="Add student">
        <span className="fx-plus">+</span>
      </button>

      {/* modal (create/edit) */}
      {modalOpen && (
        <div className="fx-modal" role="dialog" aria-modal="true" aria-label={modalMode === 'create' ? 'Add student' : 'Edit student'}>
          <div className="fx-modal-card">
            <header className="fx-modal-head">
              <h3>{modalMode === 'create' ? 'Add New Student' : `Edit Student #${modalData.Id}`}</h3>
              <button className="fx-close" onClick={closeModal} aria-label="Close">×</button>
            </header>

            <form className="fx-form" onSubmit={saveModal}>
              <label className="fx-field">
                <span>ID</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={modalData.Id}
                  onChange={(e) => setModalData(d => ({ ...d, Id: e.target.value }))}
                  disabled={modalMode === 'edit'}
                  placeholder="e.g., 101"
                  required
                />
              </label>

              <label className="fx-field">
                <span>Name</span>
                <input
                  type="text"
                  value={modalData.name}
                  onChange={(e) => setModalData(d => ({ ...d, name: e.target.value }))}
                  placeholder="Full name"
                  required
                />
              </label>

              {modalErr && <div className="fx-note error">{modalErr}</div>}

              <div className="fx-modal-actions">
                <button type="button" className="fx-btn ghost" onClick={closeModal} disabled={saving}>Cancel</button>
                <button type="submit" className="fx-btn primary" disabled={saving}>
                  {saving ? (modalMode === 'create' ? 'Creating…' : 'Saving…') : (modalMode === 'create' ? 'Create' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* delete confirm */}
      {confirm.open && (
        <div className="fx-modal" role="dialog" aria-modal="true" aria-label="Confirm delete">
          <div className="fx-modal-card">
            <header className="fx-modal-head">
              <h3>Delete Student</h3>
            </header>
            <div className="fx-modal-body">
              Delete <strong>{confirm.name || `ID ${confirm.id}`}</strong>? This cannot be undone.
            </div>
            <div className="fx-modal-actions">
              <button className="fx-btn ghost" onClick={closeConfirm} disabled={deletingId === confirm.id}>Cancel</button>
              <button className="fx-btn danger" onClick={doDelete} disabled={deletingId === confirm.id}>
                {deletingId === confirm.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && <div className="fx-toast" role="status">{toast}</div>}
    </div>
  );
}