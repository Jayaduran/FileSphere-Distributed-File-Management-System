import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import EmptyState from '../components/EmptyState';
import Icon from '../components/Icon';
import { useFiles } from '../context/useFiles';
import api from '../services/api';
import PreviewModal from '../components/PreviewModal';
import { useLocation } from 'react-router-dom';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function getMimeIcon(mimeType) {
  if (!mimeType || mimeType === 'folder') return 'folder';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) return 'file';
  return 'file';
}

// ── Slide Toggle Switch for Permissions (View ⟷ Edit) ───────────────
function SlidePermissionSwitch({ value, onChange }) {
  const isEdit = value === 'EDIT';
  return (
    <div className="slide-toggle-pill" role="group" aria-label="Permission Switch">
      <button
        type="button"
        className={`slide-toggle-option ${!isEdit ? 'active' : ''}`}
        onClick={() => onChange('VIEW')}
      >
        <Icon name="eye" size={12} /> View
      </button>
      <button
        type="button"
        className={`slide-toggle-option ${isEdit ? 'active' : ''}`}
        onClick={() => onChange('EDIT')}
      >
        <Icon name="edit" size={12} /> Edit
      </button>
    </div>
  );
}

// ── Best-in-Class Custom Sort Dropdown Component ───────────────────
function SortDropdown({ sortBy, onSortChange, keepFoldersFirst, onToggleFoldersFirst }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const options = [
    { id: 'name_asc', label: 'Name (A → Z)', icon: 'sortAsc' },
    { id: 'name_desc', label: 'Name (Z → A)', icon: 'sortDesc' },
    { id: 'date_desc', label: 'Last modified (Newest)', icon: 'clock' },
    { id: 'date_asc', label: 'Last modified (Oldest)', icon: 'clock' },
    { id: 'size_desc', label: 'Size (Largest first)', icon: 'database' },
    { id: 'size_asc', label: 'Size (Smallest first)', icon: 'database' },
  ];

  const currentOption = options.find(o => o.id === sortBy) || options[0];

  return (
    <div className="sort-dropdown-container" ref={containerRef}>
      <button
        type="button"
        className={`sort-dropdown-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen(!open)}
        title="Sort files and folders"
      >
        <Icon name="sliders" size={13} style={{ color: '#3F6B4F' }} />
        <span>{currentOption.label}</span>
        {keepFoldersFirst && <span className="sort-folders-badge">Folders 1st</span>}
        <Icon name="chevron-down" size={12} className="sort-dropdown-chevron" />
      </button>

      {open && (
        <div className="sort-popover" role="menu">
          <div className="sort-popover-header">Sort Order</div>
          {options.map((opt) => {
            const isSelected = opt.id === sortBy;
            return (
              <button
                key={opt.id}
                type="button"
                className={`sort-option-btn ${isSelected ? 'active' : ''}`}
                onClick={() => {
                  onSortChange(opt.id);
                  setOpen(false);
                }}
              >
                <div className="sort-option-left">
                  <Icon name={opt.icon} size={14} style={{ color: isSelected ? '#3F6B4F' : '#8C897E' }} />
                  <span>{opt.label}</span>
                </div>
                {isSelected && <Icon name="check" size={13} style={{ color: '#3F6B4F' }} />}
              </button>
            );
          })}

          <div className="sort-popover-divider" />

          <div
            className="sort-toggle-row"
            onClick={() => onToggleFoldersFirst(!keepFoldersFirst)}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#2B2A26' }}>
                <Icon name="folder" size={13} style={{ color: '#3F6B4F' }} />
                <span>Keep folders on top</span>
              </div>
              <span style={{ fontSize: '11px', color: '#8C897E' }}>Show folders before files</span>
            </div>
            <div className={`sort-switch ${keepFoldersFirst ? 'active' : ''}`}>
              <div className="sort-switch-thumb" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── In-App File Content & Name Editor Modal ─────────────────────────
function FileEditorModal({ item, onClose, onSaveContent }) {
  const [name, setName] = useState(item?.name || '');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const fetchContent = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/files/download/${item.id}?view=1`, { responseType: 'text' });
        if (active) {
          setContent(typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2));
        }
      } catch (err) {
        console.error('Error fetching file content:', err);
        if (active) setContent('');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchContent();
    return () => { active = false; };
  }, [item.id]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('File name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSaveContent(item.id, name.trim(), content);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const lines = content.split('\n');
  const lineCount = lines.length;
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '840px', width: '92vw', height: '86vh', display: 'flex', flexDirection: 'column', padding: 0, borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #DEDACD', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FFFFFF' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, marginRight: '16px' }}>
            <span style={{ fontSize: '20px' }}>📄</span>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="filename.txt"
              style={{ flex: 1, maxWidth: '360px', padding: '6px 12px', fontSize: '14px', fontWeight: 600, color: '#2B2A26', border: '1px solid #DEDACD', borderRadius: '6px', outline: 'none' }}
            />
            <span style={{ fontSize: '11px', color: '#5C5A52', background: '#ECE7DC', padding: '3px 8px', borderRadius: '4px' }}>
              {item.mimeType || 'Document'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{ padding: '7px 14px', borderRadius: '6px', border: '1px solid #DEDACD', background: '#FFFFFF', color: '#2B2A26', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              style={{ padding: '7px 18px', borderRadius: '6px', border: 'none', background: '#3F6B4F', color: '#FFFFFF', fontSize: '12.5px', fontWeight: 600, cursor: saving || loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 6px rgba(63, 107, 79, 0.25)' }}
            >
              <Icon name="check" size={13} />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button onClick={onClose} className="modal-close" style={{ marginLeft: '4px' }}>✕</button>
          </div>
        </div>

        {error && (
          <div style={{ padding: '8px 20px', background: '#FBEAE6', color: '#A23B2E', fontSize: '12px', borderBottom: '1px solid rgba(162,59,46,0.2)' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5C5A52', fontSize: '13px' }}>
            <div className="spinner" style={{ width: 20, height: 20, border: '2px solid #ccc', borderTopColor: '#3F6B4F', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: '8px' }} />
            Loading file contents…
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: '#FFFFFF' }}>
            <div className="code-editor-gutter">
              {lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              className="code-editor-textarea"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Edit your document or code content here..."
              spellCheck={false}
            />
          </div>
        )}

        <div style={{ padding: '8px 20px', borderTop: '1px solid #DEDACD', background: '#F4F1EA', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#5C5A52' }}>
          <div style={{ display: 'flex', gap: '16px' }}>
            <span>Lines: <b>{lineCount}</b></span>
            <span>Words: <b>{wordCount}</b></span>
            <span>Characters: <b>{charCount}</b></span>
          </div>
          <div>In-App File Content Editor • Instant Distributed Sync</div>
        </div>
      </div>
    </div>
  );
}

// ── Rename Modal ────────────────────────────────────────────────────────────
function RenameModal({ item, onClose, onRename }) {
  const [name, setName] = useState(item?.name || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || name === item.name) {
      onClose();
      return;
    }
    setLoading(true);
    try {
      await onRename(item.id, name.trim(), item.type === 'folder');
      onClose();
    } catch (err) {
      alert(err.message || 'Failed to rename');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3><Icon name="edit" size={17} /> Rename</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: '#5C5A52', display: 'block', marginBottom: '8px' }}>
            Enter a new name
          </label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #DEDACD', fontSize: '14px', outline: 'none', marginBottom: '16px', background: '#FBF9F5' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={loading} style={{ width: 'auto' }}>
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Move Modal ──────────────────────────────────────────────────────────────
function MoveModal({ item, onClose, onMove, fetchFolderTree }) {
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchFolderTree().then(tree => {
      if (active) {
        setFolders(tree || []);
        setLoading(false);
      }
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [fetchFolderTree]);

  // Compute disallowed IDs: if moving a folder, exclude itself and all its descendant subfolders!
  const disallowedIds = useMemo(() => {
    const ids = new Set();
    if (item.type === 'folder') {
      ids.add(item.id);
      let added = true;
      while (added) {
        added = false;
        for (const f of folders) {
          if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
            ids.add(f.id);
            added = true;
          }
        }
      }
    }
    return ids;
  }, [item, folders]);

  const validFolders = folders.filter(f => !disallowedIds.has(f.id));

  const handleMove = async () => {
    setMoving(true);
    try {
      await onMove(item.id, selectedFolderId, item.type === 'folder');
      onClose();
    } catch (err) {
      alert(err.message || 'Failed to move');
    } finally {
      setMoving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px' }}>
        <div className="modal-header">
          <h3><Icon name="move" size={17} /> Move "{item.name}"</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '20px' }}>
          <p style={{ fontSize: '13px', color: '#5C5A52', marginBottom: '10px' }}>
            Select destination folder (only folder destinations are valid):
          </p>
          <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #EDE9DE', borderRadius: '8px', padding: '6px' }}>
            <div
              onClick={() => setSelectedFolderId(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: selectedFolderId === null ? '#EBF2ED' : 'transparent',
                color: selectedFolderId === null ? '#3F6B4F' : '#2B2A26',
                fontWeight: selectedFolderId === null ? 600 : 400,
                fontSize: '13.5px'
              }}
            >
              <Icon name="folder" size={16} />
              <span>My Files (Root directory)</span>
            </div>
            {validFolders.map(f => (
              <div
                key={f.id}
                onClick={() => setSelectedFolderId(f.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: selectedFolderId === f.id ? '#EBF2ED' : 'transparent',
                  color: selectedFolderId === f.id ? '#3F6B4F' : '#2B2A26',
                  fontWeight: selectedFolderId === f.id ? 600 : 400,
                  fontSize: '13.5px'
                }}
              >
                <Icon name="folder" size={16} />
                <span>{f.name}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleMove} disabled={moving || loading} style={{ width: 'auto' }}>
              {moving ? 'Moving…' : 'Move here'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Who Has Access / Collaborators Modal ──────────────────────────────────────
// ── Master "Who Has Access & Sharing" Modal ─────────────────────────
function ManageAccessModal({
  item,
  onClose,
  fetchItemShares,
  revokeItemShare,
  updateSharePermission,
  onShareWithUser,
  onGeneratePublicLink,
  onRevokePublicLink,
}) {
  const isFolder = item.type === 'folder';
  const [loading, setLoading] = useState(true);
  const [accessData, setAccessData] = useState(null);
  const [email, setEmail] = useState('');
  const [invitePermission, setInvitePermission] = useState('VIEW');
  const [actionStatus, setActionStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Public Link Options state
  const [isPublic, setIsPublic] = useState(Boolean(item.publicLinkToken || item.shared));
  const [publicToken, setPublicToken] = useState(item.publicLinkToken || null);
  const [viewToken, setViewToken] = useState(null);
  const [editToken, setEditToken] = useState(null);
  const [publicPermission, setPublicPermission] = useState('VIEW');
  const [updatingLink, setUpdatingLink] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchItemShares(item.id);
      setAccessData(res);
      if (res.isPublic !== undefined) {
        setIsPublic(Boolean(res.isPublic));
      }
      if (res.publicLinkToken) {
        setPublicToken(res.publicLinkToken);
      }
      if (res.viewToken) setViewToken(res.viewToken);
      if (res.editToken) setEditToken(res.editToken);
      if (res.permission) {
        setPublicPermission(res.permission);
      }
    } catch (e) {
      console.error('loadData error:', e);
    } finally {
      setLoading(false);
    }
  }, [fetchItemShares, item.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddShare = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setActionStatus('');
    try {
      await onShareWithUser(item.id, email.trim(), invitePermission);
      setActionStatus(`Shared access granted to ${email.trim()}`);
      setEmail('');
      await loadData();
      setTimeout(() => setActionStatus(''), 3000);
    } catch (err) {
      setActionStatus(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (shareId, userEmail) => {
    try {
      await revokeItemShare(shareId);
      setActionStatus(`Removed access for ${userEmail}`);
      await loadData();
      setTimeout(() => setActionStatus(''), 3000);
    } catch (err) {
      setActionStatus(`Error: ${err.message}`);
    }
  };

  const handleUpdatePerm = async (shareId, newPerm) => {
    try {
      await updateSharePermission(shareId, newPerm);
      setActionStatus(`Updated permission to ${newPerm}`);
      await loadData();
      setTimeout(() => setActionStatus(''), 3000);
    } catch (err) {
      setActionStatus(`Error: ${err.message}`);
    }
  };

  // Toggle General / Public Link
  const handleTogglePublic = async (nextPublic) => {
    setUpdatingLink(true);
    try {
      if (nextPublic) {
        const res = await onGeneratePublicLink(item.id, isFolder, {
          permission: publicPermission,
        });
        setIsPublic(true);
        if (res.publicLinkToken) setPublicToken(res.publicLinkToken);
        if (res.viewToken) setViewToken(res.viewToken);
        if (res.editToken) setEditToken(res.editToken);
        setActionStatus('Public access link enabled!');
      } else {
        await onRevokePublicLink(item.id, isFolder);
        setIsPublic(false);
        setPublicToken(null);
        setViewToken(null);
        setEditToken(null);
        setActionStatus('Public access disabled. Item is now private.');
      }
      await loadData();
      setTimeout(() => setActionStatus(''), 3000);
    } catch (err) {
      setActionStatus(`Error: ${err.message}`);
    } finally {
      setUpdatingLink(false);
    }
  };

  const handleUpdatePublicSettings = async (nextPerm) => {
    setPublicPermission(nextPerm);
    if (onGeneratePublicLink) {
      try {
        const res = await onGeneratePublicLink(item.id, isFolder, {
          permission: nextPerm,
        });
        setIsPublic(true);
        if (res.publicLinkToken) setPublicToken(res.publicLinkToken);
        if (res.viewToken) setViewToken(res.viewToken);
        if (res.editToken) setEditToken(res.editToken);
        setActionStatus(`Access mode updated to ${nextPerm === 'EDIT' ? 'Can Edit' : 'View Only'}!`);
        setTimeout(() => setActionStatus(''), 2500);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const activeToken = publicPermission === 'EDIT' ? (editToken || publicToken) : (viewToken || publicToken);
  const shareUrl = activeToken
    ? `${window.location.origin}/share/${activeToken}`
    : `${window.location.origin}/share/${item.id}`;

  const handleCopyLink = async () => {
    try {
      let currentToken = publicPermission === 'EDIT' ? (editToken || publicToken) : (viewToken || publicToken);
      if (!isPublic || !currentToken) {
        const res = await onGeneratePublicLink(item.id, isFolder, {
          permission: publicPermission || 'VIEW',
        });
        setIsPublic(true);
        if (res.publicLinkToken) setPublicToken(res.publicLinkToken);
        if (res.viewToken) setViewToken(res.viewToken);
        if (res.editToken) setEditToken(res.editToken);
        currentToken = publicPermission === 'EDIT' ? (res.editToken || res.publicLinkToken) : (res.viewToken || res.publicLinkToken);
      }
      const finalUrl = `${window.location.origin}/share/${currentToken || item.id}`;
      await navigator.clipboard.writeText(finalUrl);
      setCopied(true);
      setActionStatus(`Copied tamper-proof ${publicPermission === 'EDIT' ? 'Edit' : 'View-Only'} link to clipboard!`);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error('handleCopyLink error:', e);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '540px', padding: 0, borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #DEDACD', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FFFFFF' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>{isFolder ? '📁' : '📄'}</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#2B2A26' }}>
                Who has access — "{item.name}"
              </h3>
              <div style={{ fontSize: '11px', color: '#5C5A52' }}>
                Manage collaborators and link sharing
              </div>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '20px', maxHeight: '78vh', overflowY: 'auto' }}>
          {/* Quick invite with Slide Button */}
          <form onSubmit={handleAddShare} style={{ marginBottom: '18px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#2B2A26', marginBottom: '6px', display: 'block' }}>
              Invite people:
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #DEDACD', fontSize: '13px', background: '#FBF9F5', outline: 'none' }}
              />
              <SlidePermissionSwitch value={invitePermission} onChange={setInvitePermission} />
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={submitting || !email.trim()}
                style={{ width: 'auto', padding: '7px 14px' }}
              >
                {submitting ? 'Adding…' : 'Invite'}
              </button>
            </div>
            {actionStatus && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: actionStatus.startsWith('Error') ? '#DC2626' : '#2F4E3B', fontWeight: 600 }}>
                {actionStatus}
              </div>
            )}
          </form>

          {/* People with access list */}
          <div style={{ marginBottom: '18px' }}>
            <h4 style={{ fontSize: '12.5px', fontWeight: 700, color: '#5C5A52', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
              People with access
            </h4>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '16px', color: '#5C5A52', fontSize: '13px' }}>Loading collaborators…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                {/* Owner entry */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '8px', background: '#FBF9F5' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#3F6B4F', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px' }}>
                      {(accessData?.owner?.name || accessData?.owner?.email || 'Me')?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#2B2A26' }}>
                        {accessData?.owner?.name || 'File Owner'} (You)
                      </div>
                      <div style={{ fontSize: '11px', color: '#5C5A52' }}>
                        {accessData?.owner?.email || ''}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', color: '#2F4E3B', fontWeight: 700, background: '#DCE8DF', padding: '3px 8px', borderRadius: '999px' }}>
                    Owner
                  </span>
                </div>

                {/* Direct shares list with Slide Switches */}
                {accessData?.shares && accessData.shares.length > 0 ? (
                  accessData.shares.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: '8px', border: '1px solid #EDE9DE', background: '#FFFFFF' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#DCE8DF', color: '#2F4E3B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px' }}>
                          {(s.user?.name || s.user?.email || 'U')?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: '#2B2A26' }}>
                            {s.user?.name || s.user?.email}
                          </div>
                          <div style={{ fontSize: '11px', color: '#5C5A52' }}>
                            {s.user?.email}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <SlidePermissionSwitch
                          value={s.permission}
                          onChange={newPerm => handleUpdatePerm(s.id, newPerm)}
                        />
                        <button
                          type="button"
                          onClick={() => handleRevoke(s.id, s.user?.email)}
                          title="Remove access"
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#A23B2E', padding: '4px', display: 'flex', alignItems: 'center' }}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: '12px', color: '#5C5A52', padding: '6px 4px' }}>
                    No other individuals have direct access yet.
                  </div>
                )}
              </div>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #EDE9DE', margin: '14px 0' }} />

          {/* General Access / Public Link */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 style={{ fontSize: '12.5px', fontWeight: 700, color: '#5C5A52', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                General Access
              </h4>
              {/* Sliding Switch: Restricted ⟷ Anyone with link */}
              <div className="slide-toggle-pill">
                <button
                  type="button"
                  disabled={updatingLink}
                  className={`slide-toggle-option ${!isPublic ? 'active' : ''}`}
                  onClick={() => handleTogglePublic(false)}
                >
                  <Icon name="lock" size={12} /> Restricted
                </button>
                <button
                  type="button"
                  disabled={updatingLink}
                  className={`slide-toggle-option ${isPublic ? 'active' : ''}`}
                  onClick={() => handleTogglePublic(true)}
                >
                  <Icon name="globe" size={12} /> Anyone with link
                </button>
              </div>
            </div>

            <div style={{ padding: '14px', background: '#FBF9F5', borderRadius: '10px', border: '1px solid #DEDACD', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {isPublic ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#2B2A26' }}>
                      Link permissions:
                    </div>
                    <SlidePermissionSwitch
                      value={publicPermission}
                      onChange={perm => handleUpdatePublicSettings(perm)}
                    />
                  </div>

                  {isFolder && (
                    <div style={{ fontSize: '11px', color: '#3F6B4F', background: '#DCE8DF', padding: '4px 8px', borderRadius: '6px' }}>
                      📁 Folder Cascade: All subfolders and files inside are automatically public under these settings.
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: '12px', color: '#5C5A52', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🔒 Currently restricted. Clicking "Copy Link" will automatically activate public access.</span>
                </div>
              )}

              {/* Link display & copy row — ALWAYS VISIBLE */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #DEDACD', fontSize: '12.5px', color: '#2B2A26', background: '#FFFFFF', outline: 'none' }}
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  style={{ padding: '8px 16px', borderRadius: '8px', background: copied ? '#DCE8DF' : '#3F6B4F', color: copied ? '#2F4E3B' : '#FFFFFF', border: 'none', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, boxShadow: '0 2px 6px rgba(63, 107, 79, 0.2)' }}
                >
                  <Icon name={copied ? 'check' : 'copy'} size={14} />
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid #DEDACD', background: '#F4F1EA', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '7px 16px', borderRadius: '6px', background: '#ECE7DC', border: '1px solid #DEDACD', color: '#2B2A26', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function OrganizeModal({ item, currentColor, currentTag, onClose, onSave }) {
  const [selectedColor, setSelectedColor] = useState(currentColor || '');
  const [tag, setTag] = useState(currentTag || '');

  const handleSave = () => {
    onSave(item.id, selectedColor, tag.trim());
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <h3><Icon name="tag" size={17} /> Organize "{item.name}"</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '20px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: '#5C5A52', display: 'block', marginBottom: '10px' }}>
            Choose color accent
          </label>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
            {PALETTE_COLORS.map(c => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setSelectedColor(c.hex)}
                title={c.name}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: c.hex,
                  border: selectedColor === c.hex ? '3px solid #2B2A26' : '2px solid transparent',
                  cursor: 'pointer',
                  transform: selectedColor === c.hex ? 'scale(1.15)' : 'scale(1)',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                }}
              />
            ))}
            {selectedColor && (
              <button
                type="button"
                onClick={() => setSelectedColor('')}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '11px', padding: '4px 8px' }}
              >
                Clear
              </button>
            )}
          </div>

          <label style={{ fontSize: '13px', fontWeight: 600, color: '#5C5A52', display: 'block', marginBottom: '8px' }}>
            Custom label / tag (optional)
          </label>
          <input
            type="text"
            placeholder="e.g. Work, Finance, Project X…"
            value={tag}
            onChange={e => setTag(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #DEDACD', fontSize: '13.5px', outline: 'none', background: '#FBF9F5', marginBottom: '20px' }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} style={{ width: 'auto' }}>
              Save changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Activity Timeline & Details Drawer ──────────────────────────────────────
function ActivityDrawer({ item, onClose, fetchFileActivity }) {
  const [activities, setActivities] = useState([]);
  const [openHistory, setOpenHistory] = useState([]);
  const [isOwner, setIsOwner] = useState(true);
  const [activeTab, setActiveTab] = useState('activity'); // 'activity' | 'opens'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (item) {
      setLoading(true);
      fetchFileActivity(item.id, item.type === 'folder')
        .then(res => {
          if (active && res) {
            setActivities(res.activities || res.activity || []);
            setOpenHistory(res.openHistory || []);
            setIsOwner(res.isOwner ?? true);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) setLoading(false);
        });
    } else {
      setLoading(false);
    }
    return () => { active = false; };
  }, [item, fetchFileActivity]);

  return (
    <div className="activity-drawer-overlay" onClick={onClose}>
      <div className="activity-drawer" onClick={e => e.stopPropagation()} style={{ width: '420px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #EDE9DE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="info" size={18} style={{ color: '#3F6B4F' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#2B2A26', margin: 0 }}>Details & Activity</h3>
          </div>
          <button className="modal-close" onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '16px' }}>✕</button>
        </div>

        {/* Item Header Banner */}
        <div style={{ padding: '18px 22px 0 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px', background: '#F4F1EA', borderRadius: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3F6B4F', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
              <Icon name={item.type === 'folder' ? 'folder' : 'file'} size={22} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '14px', color: '#2B2A26', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
              <div style={{ fontSize: '11.5px', color: '#5C5A52' }}>
                {item.type === 'folder' ? 'Folder' : formatBytes(item.size)} • {item.modifiedAt}
              </div>
            </div>
          </div>

          {/* Tab Selector */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px', borderBottom: '1px solid #EDE9DE', paddingBottom: '2px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('activity')}
              style={{
                padding: '6px 12px',
                border: 'none',
                background: 'transparent',
                fontSize: '12.5px',
                fontWeight: activeTab === 'activity' ? 700 : 500,
                color: activeTab === 'activity' ? '#3F6B4F' : '#5C5A52',
                borderBottom: activeTab === 'activity' ? '2px solid #3F6B4F' : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              Activity Timeline
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('opens')}
              style={{
                padding: '6px 12px',
                border: 'none',
                background: 'transparent',
                fontSize: '12.5px',
                fontWeight: activeTab === 'opens' ? 700 : 500,
                color: activeTab === 'opens' ? '#3F6B4F' : '#5C5A52',
                borderBottom: activeTab === 'opens' ? '2px solid #3F6B4F' : '2px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span>👁️ Who Opened</span>
              <span style={{ fontSize: '10px', background: activeTab === 'opens' ? '#3F6B4F' : '#DEDACD', color: activeTab === 'opens' ? '#FFF' : '#2B2A26', borderRadius: '999px', padding: '1px 6px', fontWeight: 700 }}>
                {openHistory.length}
              </span>
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div style={{ padding: '18px 22px', flex: 1, overflowY: 'auto' }}>
          {activeTab === 'activity' ? (
            <div>
              {/* Properties */}
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ fontSize: '11px', fontWeight: 700, color: '#5C5A52', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>Properties</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F5F3ED', paddingBottom: '4px' }}>
                    <span style={{ color: '#8C897E' }}>Type</span>
                    <span style={{ color: '#2B2A26', fontWeight: 500 }}>{item.type}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F5F3ED', paddingBottom: '4px' }}>
                    <span style={{ color: '#8C897E' }}>Location</span>
                    <span style={{ color: '#2B2A26', fontWeight: 500 }}>{item.path || 'My Files'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F5F3ED', paddingBottom: '4px' }}>
                    <span style={{ color: '#8C897E' }}>Sharing status</span>
                    <span style={{ color: item.shared ? '#3F6B4F' : '#5C5A52', fontWeight: 600 }}>{item.shared ? 'Public link active' : 'Private'}</span>
                  </div>
                </div>
              </div>

              <h4 style={{ fontSize: '11px', fontWeight: 700, color: '#5C5A52', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon name="activity" size={13} />
                Timeline Log
              </h4>

              {loading ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#8C897E', fontSize: '12px' }}>Loading timeline…</div>
              ) : activities.length === 0 ? (
                <div style={{ padding: '14px', background: '#FAF8F5', borderRadius: '8px', border: '1px solid #EDE9DE', fontSize: '12px', color: '#5C5A52' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                    <Icon name="check" size={13} style={{ color: '#3F6B4F' }} />
                    <span style={{ fontWeight: 600, color: '#2B2A26' }}>Created / Uploaded</span>
                  </div>
                  <div style={{ paddingLeft: '21px', fontSize: '11px', color: '#8C897E' }}>{item.modifiedAt}</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {activities.map((act, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: act.type === 'SHARED' ? '#E8F1EB' : act.type === 'PUBLIC_LINK' ? '#DCE8DF' : '#F4F1EA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3F6B4F', flexShrink: 0, marginTop: '2px' }}>
                        <Icon name={act.type === 'SHARED' ? 'share' : act.type === 'PUBLIC_LINK' ? 'globe' : 'clock'} size={13} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingBottom: '8px', borderBottom: idx < activities.length - 1 ? '1px solid #EDE9DE' : 'none' }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#2B2A26' }}>{act.title}</div>
                        <div style={{ fontSize: '11.5px', color: '#5C5A52', marginTop: '2px' }}>{act.description}</div>
                        {(act.deviceSummary || act.deviceName || act.browserName) && (
                          <div style={{ fontSize: '11px', color: '#3F6B4F', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                            <span>💻</span>
                            <span>{act.deviceSummary || [act.browserName, act.deviceName].filter(Boolean).join(' on ')}</span>
                          </div>
                        )}
                        <div style={{ fontSize: '10.5px', color: '#8C897E', marginTop: '3px' }}>{new Date(act.timestamp).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Dedicated Owner Open / View History List */
            <div>
              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#5C5A52' }}>
                  Real-time log of who viewed or downloaded this file.
                </span>
                <span style={{ fontSize: '11px', color: '#2F4E3B', fontWeight: 700, background: '#DCE8DF', padding: '2px 8px', borderRadius: '4px' }}>
                  Owner View
                </span>
              </div>

              {loading ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#8C897E', fontSize: '12px' }}>Loading open history…</div>
              ) : openHistory.length === 0 ? (
                <div style={{ padding: '24px 16px', background: '#FBF9F5', borderRadius: '10px', border: '1px dashed #DEDACD', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>👁️</div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#2B2A26', marginBottom: '4px' }}>No opens recorded yet</div>
                  <div style={{ fontSize: '11.5px', color: '#5C5A52', lineHeight: 1.5 }}>
                    Whenever someone previews, downloads, opens, or edits this file (via link or share), their visit will be tracked here.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {openHistory.map((rec) => {
                    const isView = rec.action === 'VIEW' || rec.action === 'OPEN';
                    const isDownload = rec.action === 'DOWNLOAD';
                    const isEdit = rec.action === 'EDIT';
                    return (
                      <div
                        key={rec.id}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid #EDE9DE',
                          background: '#FFFFFF',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '12.5px', color: '#2B2A26' }}>
                            {rec.actor}
                          </span>
                          <span
                            style={{
                              fontSize: '10.5px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '999px',
                              backgroundColor: isEdit ? '#F3E8FF' : isDownload ? '#EFF6FF' : '#E8F1EB',
                              color: isEdit ? '#7E22CE' : isDownload ? '#1D4ED8' : '#2F4E3B',
                            }}
                          >
                            {isEdit ? '✏️ Edited' : isDownload ? '⬇️ Downloaded' : '👁️ Previewed'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#8C897E' }}>
                          <span>{new Date(rec.timestamp).toLocaleString()}</span>
                          {rec.ip && <span>IP: {rec.ip}</span>}
                        </div>

                        {(rec.deviceSummary || rec.deviceName || rec.browserName) && (
                          <div style={{ fontSize: '11px', color: '#5C5A52', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px', background: '#F8F6F1', padding: '3px 6px', borderRadius: '4px' }}>
                            <span style={{ fontSize: '12px' }}>💻</span>
                            <span style={{ fontWeight: 500 }}>{rec.deviceSummary || [rec.browserName, rec.deviceName].filter(Boolean).join(' on ')}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemContextMenu({ item, isFolder, onRename, onEditContent, onMove, onOrganize, onActivity, onStar, onManageAccess, onCopyPublicLink, onDownload, onTrash, onClose }) {
  const menuRef = useRef(null);
  const [openUpward, setOpenUpward] = useState(false);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.top;
      if (spaceBelow < 360) {
        setOpenUpward(true);
      }
    }
  }, []);

  return (
    <div className={`context-menu-popover ${openUpward ? 'open-upward' : ''}`} ref={menuRef} onClick={e => e.stopPropagation()}>
      {!isFolder && onEditContent && (
        <button className="context-menu-item" onClick={() => { onClose(); onEditContent(item); }}>
          <Icon name="edit" size={15} />
          <span>Edit File Content</span>
        </button>
      )}
      <button className="context-menu-item" onClick={() => { onClose(); onRename(item); }}>
        <Icon name="tag" size={15} />
        <span>Rename</span>
      </button>
      <button className="context-menu-item" onClick={() => { onClose(); onMove(item); }}>
        <Icon name="move" size={15} />
        <span>Move to</span>
      </button>
      <button className="context-menu-item" onClick={() => { onClose(); onOrganize(item); }}>
        <Icon name="sliders" size={15} />
        <span>Organize (Color)</span>
      </button>
      <button className="context-menu-item" onClick={() => { onClose(); onActivity(item); }}>
        <Icon name="info" size={15} />
        <span>Details & Activity</span>
      </button>

      <div className="context-menu-divider" />

      <button className="context-menu-item" onClick={() => { onClose(); onStar(item.id); }}>
        <Icon name="star" size={15} />
        <span>{item.starred ? 'Remove star' : 'Add star'}</span>
      </button>
      <button className="context-menu-item" onClick={() => { onClose(); onManageAccess && onManageAccess(item); }}>
        <Icon name="share" size={15} />
        <span>Share & Who has access</span>
      </button>
      <button className="context-menu-item" onClick={() => { onClose(); onDownload(item.id, item.name, isFolder); }}>
        <Icon name="download" size={15} />
        <span>Download</span>
      </button>

      <div className="context-menu-divider" />

      <button className="context-menu-item danger" onClick={() => { onClose(); onTrash(item.id); }}>
        <Icon name="trash" size={15} />
        <span>Move to trash</span>
      </button>
    </div>
  );
}

export default function Dashboard() {
  const {
    files, storage, loading,
    fetchFiles, fetchStorageStats, uploadFile, startBatch, createFolder, addOptimisticFolder,
    downloadFile, toggleStar, toggleShare,
    moveToTrash, restoreItem, deleteItemPermanently, uploadingFiles,
    pauseUpload, resumeUpload, cancelUpload, pauseBatch, resumeBatch, cancelBatch, dismissUploads,
    shareFileWithUser, generatePublicLink, revokePublicLink,
    renameItem, moveItem, fetchFolderTree, fetchFileActivity,
    fetchItemShares, revokeItemShare, updateSharePermission, updateFileContent
  } = useFiles();

  const location = useLocation();
  const currentPath = location.pathname;

  const isSharedSection = currentPath === '/shared' || currentPath === '/shared-with-me' || currentPath === '/shared-by-me';
  
  const [sharedSubtab, setSharedSubtab] = useState(
    currentPath === '/shared-by-me' ? 'by-me' : 'with-me'
  );

  useEffect(() => {
    if (currentPath === '/shared-by-me') setSharedSubtab('by-me');
    else if (currentPath === '/shared-with-me' || currentPath === '/shared') setSharedSubtab('with-me');
  }, [currentPath]);

  // Special view type based on route
  const viewType =
    currentPath === '/trash' ? 'trash' :
    currentPath === '/starred' ? 'starred' :
    isSharedSection ? (sharedSubtab === 'by-me' ? 'shared-by-me' : 'shared-with-me') :
    currentPath === '/recent' ? 'recent' :
    'folder';

  // Folder navigation stack: [ { id, name }, ... ]
  const [folderStack, setFolderStack] = useState([{ id: 'root', name: 'My Files' }]);
  const currentFolder = folderStack[folderStack.length - 1];

  const [view, setView] = useState('list');
  const [sortBy, setSortBy] = useState('name_asc');
  const [sortKeepFoldersFirst, setSortKeepFoldersFirst] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [manageAccessItem, setManageAccessItem] = useState(null);
  const [editingFileItem, setEditingFileItem] = useState(null);
  const [renameModalItem, setRenameModalItem] = useState(null);
  const [moveModalItem, setMoveModalItem] = useState(null);
  const [organizeModalItem, setOrganizeModalItem] = useState(null);
  const [activityDrawerItem, setActivityDrawerItem] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);

  const [itemColorTags, setItemColorTags] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('filesphere_item_color_tags') || '{}');
    } catch (e) {
      return {};
    }
  });

  const handleSaveColorTag = (id, color, tag) => {
    setItemColorTags(prev => {
      const next = { ...prev, [id]: { color, tag } };
      localStorage.setItem('filesphere_item_color_tags', JSON.stringify(next));
      return next;
    });
    showToast('Updated organization tags');
  };

  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [storageFilter, setStorageFilter] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [expandedBatches, setExpandedBatches] = useState({});
  const [selectedItems, setSelectedItems] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  }, []);

  const handleCopyPublicLinkDirect = useCallback(async (item) => {
    try {
      const isFolder = item.type === 'folder';
      let token = item.publicLinkToken;
      if (!token || !item.shared) {
        const res = await generatePublicLink(item.id, isFolder, { permission: 'VIEW' });
        token = res.publicLinkToken || token;
      }
      const url = `${window.location.origin}/share/${token || item.id}?mode=view`;
      await navigator.clipboard.writeText(url);
      showToast('Public view link copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy public link:', err);
      showToast('Failed to copy link: ' + (err.message || ''));
    }
  }, [generatePublicLink, showToast]);

  // Fetch when route, current folder changes, or storage category filter changes
  useEffect(() => {
    if (storageFilter) {
      fetchFiles({ type: 'storage' });
    } else if (viewType === 'folder') {
      fetchFiles({ type: 'folder', folderId: currentFolder.id });
      fetchStorageStats();
    } else {
      fetchFiles({ type: viewType });
    }
  }, [fetchFiles, fetchStorageStats, viewType, currentFolder.id, storageFilter]);

  // Reset folder stack when navigating to a different section
  useEffect(() => {
    setFolderStack([{ id: 'root', name: 'My Files' }]);
    setShowNewFolderInput(false);
    setSelectedItems([]);
    setActiveMenuId(null);
  }, [currentPath]);

  // 1. Initial filter based on viewType & strict folder hierarchy
  let visibleFiles = files.filter(f => {
    if (viewType === 'trash') return f.status === 'trash';
    if (viewType === 'starred') return f.starred && f.status !== 'trash';
    if (viewType === 'shared-with-me') return (f.shareScope === 'with-me' || f.sharedBy) && f.status !== 'trash';
    if (viewType === 'shared-by-me') return (f.shareScope === 'by-me' || f.sharedWithUser || f.shared) && f.status !== 'trash';
    if (viewType === 'shared') return (f.shared || f.sharedBy || f.sharedWithUser) && f.status !== 'trash';
    if (f.status === 'trash') return false;

    // Strict Folder Hierarchy Retrieval:
    // Only display items that belong to the current active folder level
    if (viewType === 'folder') {
      const isRoot = currentFolder.id === 'root';
      if (isRoot) {
        return !f.folderId || f.folderId === 'root' || f.folderId === null;
      } else {
        return f.folderId === currentFolder.id;
      }
    }
    return true;
  });

  // 2. Storage breakdown filter if active
  if (storageFilter) {
    visibleFiles = visibleFiles.filter(f => {
      if (!f.type) return false;
      if (storageFilter === 'Images') return f.type.startsWith('image/');
      if (storageFilter === 'Videos') return f.type.startsWith('video/');
      if (storageFilter === 'Documents') return f.type.includes('pdf') || f.type.includes('document') || f.type.includes('text/');
      if (storageFilter === 'Other') return !f.type.startsWith('image/') && !f.type.startsWith('video/') && !f.type.includes('pdf') && !f.type.includes('document') && !f.type.includes('text/') && f.type !== 'folder';
      return true;
    });
  }

  // 3. Drive-style Advanced Filters
  if (advancedFilters) {
    if (advancedFilters.type && advancedFilters.type !== 'all') {
      if (advancedFilters.type === 'folders') {
        visibleFiles = visibleFiles.filter(f => f.type === 'folder');
      } else if (advancedFilters.type === 'documents') {
        visibleFiles = visibleFiles.filter(f => f.type !== 'folder' && (f.type.includes('pdf') || f.type.includes('document') || f.type.includes('text/') || f.name.match(/\.(pdf|docx?|txt|rtf|odt|xlsx?|csv)$/i)));
      } else if (advancedFilters.type === 'images') {
        visibleFiles = visibleFiles.filter(f => f.type.startsWith('image/') || f.name.match(/\.(png|jpe?g|gif|webp|svg)$/i));
      } else if (advancedFilters.type === 'videos') {
        visibleFiles = visibleFiles.filter(f => f.type.startsWith('video/') || f.type.startsWith('audio/') || f.name.match(/\.(mp4|mov|avi|mkv|mp3|wav)$/i));
      }
    }

    if (advancedFilters.owner && advancedFilters.owner !== 'anyone') {
      if (advancedFilters.owner === 'me') {
        visibleFiles = visibleFiles.filter(f => !f.sharedBy);
      } else if (advancedFilters.owner === 'not-me') {
        visibleFiles = visibleFiles.filter(f => !!f.sharedBy);
      }
    }

    if (advancedFilters.starred) {
      visibleFiles = visibleFiles.filter(f => f.starred);
    }

    if (advancedFilters.shared) {
      visibleFiles = visibleFiles.filter(f => f.shared || f.publicLinkToken);
    }

    if (advancedFilters.date && advancedFilters.date !== 'anytime') {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      visibleFiles = visibleFiles.filter(f => {
        const itemDate = f.timestamp || new Date(f.rawDate || f.modifiedAt).getTime();
        if (isNaN(itemDate)) return true;
        if (advancedFilters.date === 'custom') {
          const start = advancedFilters.dateStart ? new Date(advancedFilters.dateStart).setHours(0, 0, 0, 0) : null;
          const end = advancedFilters.dateEnd ? new Date(advancedFilters.dateEnd).setHours(23, 59, 59, 999) : null;
          if (start && itemDate < start) return false;
          if (end && itemDate > end) return false;
          return true;
        }
        const diff = now - itemDate;
        if (advancedFilters.date === 'today') return diff <= oneDay;
        if (advancedFilters.date === 'last7') return diff <= 7 * oneDay;
        if (advancedFilters.date === 'last30') return diff <= 30 * oneDay;
        if (advancedFilters.date === 'thisYear') return diff <= 365 * oneDay;
        return true;
      });
    }

    if (advancedFilters.size && advancedFilters.size !== 'all') {
      visibleFiles = visibleFiles.filter(f => {
        const s = f.size || 0;
        if (advancedFilters.size === 'tiny') return s < 1024 * 1024;
        if (advancedFilters.size === 'small') return s >= 1024 * 1024 && s <= 10 * 1024 * 1024;
        if (advancedFilters.size === 'medium') return s > 10 * 1024 * 1024 && s <= 100 * 1024 * 1024;
        if (advancedFilters.size === 'large') return s > 100 * 1024 * 1024;
        return true;
      });
    }

    if (advancedFilters.extension) {
      const exts = advancedFilters.extension.split(',').map(e => e.trim().replace(/^\./, '').toLowerCase()).filter(Boolean);
      if (exts.length > 0) {
        visibleFiles = visibleFiles.filter(f => {
          if (f.type === 'folder') return false;
          const nameLower = (f.name || '').toLowerCase();
          return exts.some(ext => nameLower.endsWith('.' + ext));
        });
      }
    }
  }

  // 4. Sort folders and files according to selected sort criteria (both sorted together by default)
  visibleFiles = [...visibleFiles].sort((a, b) => {
    if (sortKeepFoldersFirst) {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;
    }

    if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'name_desc') return (b.name || '').localeCompare(a.name || '');
    if (sortBy === 'date_desc') {
      const dateA = a.timestamp || new Date(a.rawDate || a.modifiedAt || 0).getTime();
      const dateB = b.timestamp || new Date(b.rawDate || b.modifiedAt || 0).getTime();
      return dateB - dateA;
    }
    if (sortBy === 'date_asc') {
      const dateA = a.timestamp || new Date(a.rawDate || a.modifiedAt || 0).getTime();
      const dateB = b.timestamp || new Date(b.rawDate || b.modifiedAt || 0).getTime();
      return dateA - dateB;
    }
    if (sortBy === 'size_desc') return (b.size || 0) - (a.size || 0);
    if (sortBy === 'size_asc') return (a.size || 0) - (b.size || 0);
    return 0;
  });

  // Helper to check if a folder contains active uploads (simulated simply by checking if any upload belongs to it)
  const isFolderUploading = (folderId) => {
    return uploadingFiles.some(u => u.folderId === folderId);
  };

  // ── Folder navigation ────
  const openFolder = (id, name) => {
    setFolderStack(prev => [...prev, { id, name }]);
    setShowNewFolderInput(false);
  };

  const navigateTo = (index) => {
    setFolderStack(prev => prev.slice(0, index + 1));
  };

  // ── Upload handlers ────
  const handleUploadClick = () => fileInputRef.current?.click();
  const handleFolderUploadClick = () => folderInputRef.current?.click();

  const handleFileChange = async (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (!selectedFiles.length) return;
    const batchId = Math.random().toString(36).substr(2, 9);
    for (const file of selectedFiles) {
      uploadFile(file, currentFolder.id === 'root' ? null : currentFolder.id, batchId);
    }
    startBatch(batchId);
    showToast(`${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} added to upload queue!`);
    e.target.value = null;
  };

  // Batch upload for directories: creates tree in 1 fast roundtrip & reflects folder instantly
  const processFolderUpload = async (filesArr) => {
    if (!filesArr || filesArr.length === 0) return;
    const batchId = Math.random().toString(36).substr(2, 9);
    const parentFolderId = currentFolder.id === 'root' ? null : currentFolder.id;

    // 1. Determine top-level folder name
    const samplePath = filesArr[0].webkitRelativePath || '';
    const topFolderName = samplePath ? samplePath.split('/')[0] : 'Uploaded Folder';
    const totalFolderSize = filesArr.reduce((sum, f) => sum + (f.size || 0), 0);

    // 2. Optimistically reflect folder in UI within 0ms!
    if (addOptimisticFolder) {
      addOptimisticFolder(topFolderName, totalFolderSize);
    }

    // 3. Extract unique relative directory paths
    const uniqueDirs = new Set();
    filesArr.forEach(file => {
      if (file.webkitRelativePath) {
        const parts = file.webkitRelativePath.split('/');
        parts.pop(); // remove filename
        while (parts.length > 0) {
          uniqueDirs.add(parts.join('/'));
          parts.pop();
        }
      }
    });

    const dirList = Array.from(uniqueDirs).sort((a, b) => a.split('/').length - b.split('/').length);

    try {
      // 4. Create all folders in 1 single fast round-trip
      let pathMap = {};
      if (dirList.length > 0) {
        const res = await api.post('/folders/batch', {
          parentId: parentFolderId,
          directories: dirList,
        });
        pathMap = res.data.pathMap || {};
      }

      // 5. Enqueue all files simultaneously into upload queue
      for (const file of filesArr) {
        let dirPath = '';
        if (file.webkitRelativePath) {
          const parts = file.webkitRelativePath.split('/');
          parts.pop();
          dirPath = parts.join('/');
        }
        const targetFolderId = dirPath ? (pathMap[dirPath] || parentFolderId) : parentFolderId;
        uploadFile(file, targetFolderId, batchId);
      }

      startBatch(batchId);
      showToast(`Folder "${topFolderName}" (${filesArr.length} files) added to upload queue!`);
    } catch (err) {
      console.error('Folder upload error:', err);
      // Fallback: still enqueue files under current folder
      for (const file of filesArr) {
        uploadFile(file, parentFolderId, batchId);
      }
      startBatch(batchId);
      showToast(`Folder added to upload queue.`);
    }
  };

  const handleFolderChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArr = Array.from(e.target.files);
      await processFolderUpload(filesArr);
    }
    e.target.value = null;
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (viewType === 'folder') {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);

    if (viewType !== 'folder') {
      showToast('You can only upload files into folders.');
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArr = Array.from(e.dataTransfer.files);
      const hasDirectory = filesArr.some(f => f.webkitRelativePath);

      if (hasDirectory) {
        await processFolderUpload(filesArr);
      } else {
        const batchId = Math.random().toString(36).substr(2, 9);
        const parentFolderId = currentFolder.id === 'root' ? null : currentFolder.id;
        for (const file of filesArr) {
          uploadFile(file, parentFolderId, batchId);
        }
        startBatch(batchId);
        showToast(`${filesArr.length} item${filesArr.length !== 1 ? 's' : ''} added to upload queue!`);
      }
    }
  };
  const handleDownload = async (id, name, isFolder) => {
    try {
      await downloadFile(id, name, isFolder);
    } catch (err) {
      showToast(err?.message || 'Download failed');
    }
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await createFolder(newFolderName, currentFolder.id === 'root' ? null : currentFolder.id);
      setNewFolderName('');
      setShowNewFolderInput(false);
      showToast('Folder created');
      fetchFiles({ type: 'folder', folderId: currentFolder.id });
    } catch (err) {
      showToast('Failed to create folder');
    }
  };

  const toggleSelection = (id) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === visibleFiles.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(visibleFiles.map(f => f.id));
    }
  };

  const handleBulkAction = (actionFn, successMsg) => {
    const ids = [...selectedItems];
    // 1. Instantly clear toolbar and remove items from UI
    setSelectedItems([]);
    // 2. Fire all actions in parallel (each action already does optimistic UI update)
    Promise.all(ids.map(id => actionFn(id)))
      .then(() => showToast(successMsg))
      .catch(() => showToast('Some actions failed'));
  };

  // ── Storage ────
  const usedPct = storage.limitBytes
    ? Math.min(100, Math.round((storage.usedBytes / storage.limitBytes) * 100))
    : 0;

  const pageTitle =
    currentPath === '/trash' ? 'Trash' :
    currentPath === '/starred' ? 'Starred' :
    isSharedSection ? (sharedSubtab === 'by-me' ? 'Shared by me' : 'Shared with me') :
    currentPath === '/storage' ? 'Storage' :
    currentPath === '/recent' ? 'Recent' :
    'Your files';

  const pageDesc =
    currentPath === '/trash' ? 'Items in trash will be permanently deleted based on your retention policy.' :
    currentPath === '/starred' ? 'Your favorite files and folders.' :
    isSharedSection ? (sharedSubtab === 'by-me' ? 'Files and folders you have shared with others or made public.' : 'Files and folders shared with you by other users.') :
    currentPath === '/storage' ? 'All files sorted by size.' :
    currentPath === '/recent' ? 'Recently accessed files.' :
    'Everything you upload will show up here.';

  const handleSearch = useCallback((query) => {
    if (query) {
      fetchFiles({ type: 'search', query });
    } else {
      fetchFiles({ type: viewType, folderId: currentFolder.id });
    }
  }, [fetchFiles, viewType, currentFolder.id]);

  // ── Storage Breakdown ────
  const storageBreakdown = storage?.breakdown || [];

  return (
    <div className="app-shell">
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} multiple onChange={handleFileChange} />
      <input type="file" ref={folderInputRef} style={{ display: 'none' }} webkitdirectory="" multiple onChange={handleFolderChange} />

      <Sidebar 
        onUploadClick={handleUploadClick} 
        onFolderUploadClick={handleFolderUploadClick} 
        onNewFolderClick={() => setShowNewFolderInput(true)} 
      />

      <main 
        className="main-pane"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ position: 'relative' }}
      >
        {isDragging && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(67, 56, 202, 0.08)',
            border: '3px dashed #4338CA',
            borderRadius: '16px',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            color: '#4338CA'
          }}>
            <Icon name="upload" size={64} />
            <h2 style={{ marginTop: '16px' }}>Drop files to upload to "{currentFolder.name}"</h2>
          </div>
        )}
        <Topbar 
          searchPlaceholder="Search your files…" 
          onSearch={handleSearch} 
          onAdvancedFilterChange={(filters) => setAdvancedFilters(filters)} 
        />

        <div className="page-header">
          <div>
            {/* Breadcrumb for folder navigation */}
            <div className="crumb">
              FileSphere{' '}
              {viewType === 'folder' ? (
                <>
                  <span>›</span>{' '}
                  {folderStack.map((crumb, i) => (
                    <span
                      key={crumb.id}
                      onDragOver={(e) => {
                        if (draggedItem && (i < folderStack.length - 1)) {
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}
                      onDrop={async (e) => {
                        if (draggedItem && (i < folderStack.length - 1)) {
                          e.preventDefault();
                          e.stopPropagation();
                          const movingItem = draggedItem;
                          setDraggedItem(null);
                          try {
                            await moveItem(movingItem.id, crumb.id === 'root' ? null : crumb.id, movingItem.type === 'folder');
                            showToast(`Moved "${movingItem.name}" to "${crumb.name}"`);
                          } catch (err) {
                            showToast(`Failed to move: ${err.message}`);
                          }
                        }
                      }}
                    >
                      {i > 0 && <span style={{ margin: '0 4px' }}>›</span>}
                      {i < folderStack.length - 1 ? (
                        <button
                          className="crumb-link"
                          onClick={() => navigateTo(i)}
                        >
                          {crumb.name}
                        </button>
                      ) : (
                        <span>{crumb.name}</span>
                      )}
                    </span>
                  ))}
                </>
              ) : (
                <><span>›</span> {pageTitle}</>
              )}
            </div>
            <h1>
              {storageFilter ? storageFilter : (viewType === 'folder' ? currentFolder.name : pageTitle)}
            </h1>
            <p className="page-subtitle">
              {storageFilter ? `Showing all ${storageFilter.toLowerCase()} across your drive.` : pageDesc}
            </p>
          </div>
        </div>

        {/* Slide Button for Shared Views */}
        {isSharedSection && (
          <div style={{ margin: '0 32px 18px', display: 'flex', alignItems: 'center' }}>
            <div className="slide-toggle-pill" style={{ padding: '4px', background: '#EAE6DB', borderRadius: '999px', display: 'inline-flex', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.06)' }}>
              <button
                type="button"
                className={`slide-toggle-option ${sharedSubtab === 'with-me' ? 'active' : ''}`}
                onClick={() => setSharedSubtab('with-me')}
                style={{ padding: '7px 20px', fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '7px' }}
              >
                <Icon name="user" size={14} /> Shared with me
              </button>
              <button
                type="button"
                className={`slide-toggle-option ${sharedSubtab === 'by-me' ? 'active' : ''}`}
                onClick={() => setSharedSubtab('by-me')}
                style={{ padding: '7px 20px', fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '7px' }}
              >
                <Icon name="link" size={14} /> Shared by me
              </button>
            </div>
          </div>
        )}

        {previewFile && (
          <PreviewModal 
            file={previewFile} 
            onClose={() => setPreviewFile(null)} 
            onDownload={handleDownload} 
          />
        )}

        {viewType === 'folder' && currentFolder.id === 'root' && storageBreakdown && storageBreakdown.length > 0 && (
          <div className="storage-breakdown" style={{ margin: '0 32px 24px', padding: '24px', background: '#fff', borderRadius: '12px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {storageBreakdown.map(item => (
              <div 
                key={item.label} 
                onClick={() => setStorageFilter(prev => prev === item.label ? null : item.label)}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '12px', minWidth: '150px', cursor: 'pointer',
                  padding: '8px', borderRadius: '8px', transition: 'all 0.2s ease',
                  background: storageFilter === item.label ? `${item.color}15` : 'transparent',
                  border: storageFilter === item.label ? `1px solid ${item.color}40` : '1px solid transparent'
                }}
              >
                <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: `${item.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={item.label === 'Images' ? 'image' : item.label === 'Videos' ? 'film' : item.label === 'Documents' ? 'fileText' : 'file'} size={20} style={{ color: item.color }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: storageFilter === item.label ? item.color : '#111827' }}>{item.label}</div>
                  <div style={{ fontSize: '13px', color: '#6B7280' }}>
                    {formatBytes(item.size)} <span style={{ opacity: 0.7, fontSize: '12px' }}>({item.count} {item.count === 1 ? 'file' : 'files'})</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="toolbar-row">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {viewType === 'folder' && folderStack.length > 1 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => navigateTo(folderStack.length - 2)}
                style={{ gap: '6px', display: 'flex', alignItems: 'center' }}
              >
                ← Back
              </button>
            )}
            <div className="view-toggle">
              <button className={view === 'grid' ? 'active' : ''} onClick={() => setView('grid')} aria-label="Grid view">
                <Icon name="folder" size={16} />
              </button>
              <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')} aria-label="List view">
                <Icon name="inbox" size={16} />
              </button>
            </div>

            {/* Modern Best-in-Class Sort Dropdown */}
            <SortDropdown
              sortBy={sortBy}
              onSortChange={setSortBy}
              keepFoldersFirst={sortKeepFoldersFirst}
              onToggleFoldersFirst={setSortKeepFoldersFirst}
            />

            {/* Quick Select All in toolbar */}
            {visibleFiles.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={toggleSelectAll}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: selectedItems.length > 0 ? '#2F4E3B' : '#5C5A52',
                  backgroundColor: selectedItems.length > 0 ? '#DCE8DF' : '#F4F1EA',
                  border: '1px solid ' + (selectedItems.length > 0 ? '#3F6B4F' : '#DEDACD'),
                  borderRadius: '6px',
                  padding: '5px 10px',
                  cursor: 'pointer',
                }}
                title={selectedItems.length === visibleFiles.length ? 'Deselect all items' : 'Select all items'}
              >
                <input
                  type="checkbox"
                  checked={selectedItems.length > 0 && selectedItems.length === visibleFiles.length}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleSelectAll();
                  }}
                  style={{ cursor: 'pointer', margin: 0 }}
                />
                <span>Select All</span>
              </button>
            )}
          </div>
          <span className="result-count">
            {loading ? 'Loading…' : (
              (() => {
                const fCount = visibleFiles.filter(f => f.type === 'folder').length;
                const fiCount = visibleFiles.filter(f => f.type !== 'folder').length;
                const parts = [];
                if (fCount > 0) parts.push(`${fCount} folder${fCount !== 1 ? 's' : ''}`);
                if (fiCount > 0) parts.push(`${fiCount} file${fiCount !== 1 ? 's' : ''}`);
                return parts.length > 0 ? parts.join(', ') : '0 items';
              })()
            )}
          </span>
        </div>

        {selectedItems.length > 0 && (
          <div className="bulk-actions-toolbar" style={{ background: '#EEF2FF', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '8px', marginBottom: '16px', border: '1px solid #C7D2FE', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#4338CA' }}>
                <input
                  type="checkbox"
                  checked={visibleFiles.length > 0 && selectedItems.length === visibleFiles.length}
                  onChange={toggleSelectAll}
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                />
                Select All
              </label>
              <span style={{ fontWeight: 600, color: '#4338CA' }}>({selectedItems.length} of {visibleFiles.length} selected)</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={toggleSelectAll}
                style={{
                  background: '#FFFFFF',
                  color: '#4338CA',
                  border: '1px solid #C7D2FE',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
                title={selectedItems.length === visibleFiles.length ? 'Deselect all' : 'Select all'}
              >
                <Icon name="check" size={13} />
                {selectedItems.length === visibleFiles.length ? 'Deselect All' : 'Select All'}
              </button>

              {viewType === 'trash' ? (
                <>
                  <button className="btn btn-sm" style={{ background: '#10B981', color: '#fff', border: 'none' }}
                    onClick={() => handleBulkAction(restoreItem, 'Items restored')}
                  >Restore Selected</button>
                  <button className="btn btn-sm" style={{ background: '#EF4444', color: '#fff', border: 'none' }}
                    onClick={() => handleBulkAction(deleteItemPermanently, 'Items permanently deleted')}
                  >Delete Permanently</button>
                </>
              ) : (
                <button className="btn btn-sm" style={{ background: '#EF4444', color: '#fff', border: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => handleBulkAction(moveToTrash, 'Items moved to trash')}
                >
                  <Icon name="trash" size={14} /> Move to Trash
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedItems([])}>Clear Selection</button>
            </div>
          </div>
        )}

        {/* New folder form */}
        {showNewFolderInput && (
          <form onSubmit={handleCreateFolder} className="new-folder-form">
            <Icon name="folder" size={18} />
            <input
              autoFocus
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="Folder name…"
            />
            <button type="submit" className="btn btn-primary btn-sm" style={{ width: 'auto' }}>Create</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowNewFolderInput(false); setNewFolderName(''); }}>
              Cancel
            </button>
          </form>
        )}

        {/* Empty state */}
        {!loading && visibleFiles.length === 0 && (
          <EmptyState
            icon={currentPath === '/trash' ? 'trash' : 'folder'}
            title={
              currentPath === '/trash' ? 'Trash is empty' :
              currentPath === '/starred' ? 'No starred files' :
              currentPath === '/shared' ? 'No shared files' :
              folderStack.length > 1 ? `"${currentFolder.name}" is empty` :
              'No files yet'
            }
            description={
              currentPath === '/trash' ? 'Items you delete will show up here.' :
              currentPath === '/starred' ? 'Star items to find them easily.' :
              currentPath === '/shared' ? 'Files you share publicly will appear here.' :
              'Upload your first file to start building your library.'
            }
            actionLabel={viewType === 'folder' ? 'Upload file' : undefined}
            onAction={viewType === 'folder' ? handleUploadClick : undefined}
          />
        )}

        {/* File table or grid */}
        {!loading && visibleFiles.length > 0 && view === 'list' && (
          <table className="file-table">
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedItems.length > 0 && selectedItems.length === visibleFiles.length} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                </th>
                <th>Name</th>
                <th>Visibility</th>
                <th>Last modified</th>
                <th>Size</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleFiles.map(f => (
                <tr
                  key={f.id}
                  className={`${f.type === 'folder' ? 'folder-row' : ''} ${dragOverFolderId === f.id ? 'drag-target-hover' : ''}`}
                  draggable={f.status !== 'trash'}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', f.id);
                    setDraggedItem(f);
                  }}
                  onDragEnd={() => {
                    setDraggedItem(null);
                    setDragOverFolderId(null);
                  }}
                  onDragOver={(e) => {
                    if (draggedItem && f.type === 'folder' && draggedItem.id !== f.id) {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverFolderId(f.id);
                    }
                  }}
                  onDragLeave={(e) => {
                    if (dragOverFolderId === f.id) {
                      setDragOverFolderId(null);
                    }
                  }}
                  onDrop={async (e) => {
                    if (draggedItem && f.type === 'folder' && draggedItem.id !== f.id) {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverFolderId(null);
                      const movingItem = draggedItem;
                      setDraggedItem(null);
                      try {
                        await moveItem(movingItem.id, f.id, movingItem.type === 'folder');
                        showToast(`Moved "${movingItem.name}" into "${f.name}"`);
                      } catch (err) {
                        showToast(`Failed to move: ${err.message}`);
                      }
                    }
                  }}
                  onDoubleClick={f.type === 'folder' ? () => openFolder(f.id, f.name) : () => setPreviewFile(f)}
                >
                  <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedItems.includes(f.id)} onChange={() => toggleSelection(f.id)} style={{ cursor: 'pointer' }} />
                  </td>
                  <td>
                    <div className="file-name-cell">
                      <span className={`file-icon-wrap ${f.type === 'folder' ? 'folder-icon' : ''}`}>
                        {f.type === 'folder' && isFolderUploading(f.id) ? (
                          <div className="spinner" style={{ width: 14, height: 14, border: '2px solid #ccc', borderTopColor: '#007BFF', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        ) : (
                          <Icon name={getMimeIcon(f.type)} size={18} />
                        )}
                      </span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {itemColorTags[f.id]?.color && (
                            <span
                              className="color-tag-dot"
                              style={{ background: itemColorTags[f.id].color }}
                              title={itemColorTags[f.id].tag || 'Color badge'}
                            />
                          )}
                          {itemColorTags[f.id]?.tag && (
                            <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: `${itemColorTags[f.id].color || '#3F6B4F'}20`, color: itemColorTags[f.id].color || '#3F6B4F', fontWeight: 600, marginRight: '6px' }}>
                              {itemColorTags[f.id].tag}
                            </span>
                          )}
                          {f.type === 'folder' ? (
                            <button
                              className="folder-name-btn"
                              onClick={() => openFolder(f.id, f.name)}
                            >
                              {f.name}
                            </button>
                          ) : (
                            <span>{f.name}</span>
                          )}
                        </div>
                        {f.status === 'uploading' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                            <div style={{ width: '90px', height: '4px', background: '#E2E8F0', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.max(f.progress || 5, 5)}%`, height: '100%', background: '#4F46E5', transition: 'width 0.2s' }} />
                            </div>
                            <span style={{ fontSize: '11px', color: '#4F46E5', fontWeight: 600 }}>{f.progress || 5}% Uploading...</span>
                          </div>
                        )}
                        {(viewType !== 'folder' || storageFilter) && f.path && (
                          <div className="file-path" style={{ fontSize: '11px', color: '#8B92A0', marginTop: '2px' }}>{f.path}/{f.name}</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Visibility cell — lock or globe or shared by badge */}
                  <td>
                    {f.sharedBy ? (
                      <span className="shared-by-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '12px', background: '#EEF2FF', color: '#4F46E5', fontSize: '12px', fontWeight: 500 }} title={`Shared by ${f.sharedBy}`}>
                        <Icon name="user" size={13} />
                        {f.sharedBy}
                      </span>
                    ) : (
                      <button
                        className={`visibility-badge ${f.shared ? 'visibility-public' : 'visibility-private'}`}
                        onClick={() => setManageAccessItem(f)}
                        title={f.shared ? 'Public — click to manage' : 'Private — click to share'}
                      >
                        <Icon name={f.shared ? 'globe' : 'lock'} size={13} />
                        {f.shared ? 'Public' : 'Private'}
                      </button>
                    )}
                  </td>

                  <td>{f.modifiedAt}</td>
                  <td>{formatBytes(f.size)}</td>

                  <td>
                    <div className="action-cell">
                      {f.status !== 'trash' ? (
                        <>
                          {f.type !== 'folder' && (
                            <button className="icon-btn" aria-label="Preview" onClick={(e) => { e.stopPropagation(); setPreviewFile(f); }} title="Preview">
                              <Icon name="eye" size={16} />
                            </button>
                          )}
                          <button className="icon-btn" aria-label="Download" onClick={(e) => { e.stopPropagation(); handleDownload(f.id, f.name, f.type === 'folder'); }} title="Download">
                            <Icon name="download" size={16} />
                          </button>
                          <button
                            className={`icon-btn star-btn ${f.starred ? 'active' : ''}`}
                            aria-label="Star"
                            onClick={() => toggleStar(f.id)}
                            title={f.starred ? 'Unstar' : 'Star'}
                          >
                            <Icon name="star" size={16} />
                          </button>
                          
                          {/* 3-Dot Context Menu */}
                          <div style={{ position: 'relative' }}>
                            <button
                              className="icon-btn"
                              aria-label="More actions"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId(activeMenuId === f.id ? null : f.id);
                              }}
                              title="More actions"
                            >
                              <Icon name="dotsVertical" size={16} />
                            </button>
                            {activeMenuId === f.id && (
                              <ItemContextMenu
                                onEditContent={setEditingFileItem}
                                item={f}
                                isFolder={f.type === 'folder'}
                                onRename={setRenameModalItem}
                                onMove={setMoveModalItem}
                                onOrganize={setOrganizeModalItem}
                                onActivity={setActivityDrawerItem}
                                onStar={toggleStar}
                                onShare={setManageAccessItem}
                                onManageAccess={setManageAccessItem}
                                onCopyPublicLink={handleCopyPublicLinkDirect}
                                onDownload={handleDownload}
                                onTrash={moveToTrash}
                                onClose={() => setActiveMenuId(null)}
                              />
                            )}
                          </div>
                        </>
                      ) : (
                        <button className="icon-btn" aria-label="Restore" onClick={() => restoreItem(f.id)} title="Restore">
                          <Icon name="refresh" size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!loading && visibleFiles.length > 0 && view === 'grid' && (
          <div className="file-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
            {visibleFiles.map(f => (
              <div 
                key={f.id} 
                className={`file-card ${dragOverFolderId === f.id ? 'drag-target-hover' : ''}`}
                draggable={f.status !== 'trash'}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', f.id);
                  setDraggedItem(f);
                }}
                onDragEnd={() => {
                  setDraggedItem(null);
                  setDragOverFolderId(null);
                }}
                onDragOver={(e) => {
                  if (draggedItem && f.type === 'folder' && draggedItem.id !== f.id) {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverFolderId(f.id);
                  }
                }}
                onDragLeave={(e) => {
                  if (dragOverFolderId === f.id) {
                    setDragOverFolderId(null);
                  }
                }}
                onDrop={async (e) => {
                  if (draggedItem && f.type === 'folder' && draggedItem.id !== f.id) {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverFolderId(null);
                    const movingItem = draggedItem;
                    setDraggedItem(null);
                    try {
                      await moveItem(movingItem.id, f.id, movingItem.type === 'folder');
                      showToast(`Moved "${movingItem.name}" into "${f.name}"`);
                    } catch (err) {
                      showToast(`Failed to move: ${err.message}`);
                    }
                  }
                }}
                style={{ background: '#fff', borderRadius: '12px', padding: '16px', boxShadow: selectedItems.includes(f.id) ? '0 0 0 2px #4338CA' : '0 1px 3px rgba(0,0,0,0.05)', position: 'relative', border: '1px solid #eee', cursor: f.type === 'folder' ? 'pointer' : 'default' }}
                onDoubleClick={f.type === 'folder' ? () => openFolder(f.id, f.name) : undefined}
              >
                <div style={{ position: 'absolute', top: '12px', left: '12px' }}>
                  <input type="checkbox" checked={selectedItems.includes(f.id)} onChange={() => toggleSelection(f.id)} style={{ cursor: 'pointer' }} onClick={e => e.stopPropagation()} />
                </div>
                <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {f.sharedBy ? (
                    <span title={`Shared by ${f.sharedBy}`} style={{ color: '#4F46E5', display: 'flex', alignItems: 'center', background: '#EEF2FF', padding: '2px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: 600 }}>
                      <Icon name="user" size={11} style={{ marginRight: '3px' }} />
                      {f.sharedBy}
                    </span>
                  ) : (
                    <>
                      <button className="icon-btn" style={{ padding: '4px', border: 'none', background: 'transparent' }} onClick={() => setManageAccessItem(f)} title="Share & Manage Access">
                        <Icon name={f.shared ? 'globe' : 'lock'} size={14} />
                      </button>
                    </>
                  )}
                  <button className={`icon-btn star-btn ${f.starred ? 'active' : ''}`} style={{ padding: '4px', border: 'none', background: 'transparent' }} onClick={() => toggleStar(f.id)} title="Star">
                    <Icon name="star" size={14} />
                  </button>

                  {/* 3-Dot Context Menu in Card */}
                  <div style={{ position: 'relative' }}>
                    <button
                      className="icon-btn"
                      style={{ padding: '4px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === f.id ? null : f.id);
                      }}
                      title="More actions"
                    >
                      <Icon name="dotsVertical" size={14} />
                    </button>
                    {activeMenuId === f.id && (
                      <ItemContextMenu
                        onEditContent={setEditingFileItem}
                        item={f}
                        isFolder={f.type === 'folder'}
                        onRename={setRenameModalItem}
                        onMove={setMoveModalItem}
                        onOrganize={setOrganizeModalItem}
                        onActivity={setActivityDrawerItem}
                        onStar={toggleStar}
                        onShare={setManageAccessItem}
                        onManageAccess={setManageAccessItem}
                        onCopyPublicLink={handleCopyPublicLinkDirect}
                        onDownload={handleDownload}
                        onTrash={moveToTrash}
                        onClose={() => setActiveMenuId(null)}
                      />
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '16px', marginBottom: '16px' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '12px', background: f.type === 'folder' ? '#DCE8DF' : '#F4F1EA', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px', color: f.type === 'folder' ? '#3F6B4F' : '#5C5A52' }}>
                    {f.type === 'folder' && isFolderUploading(f.id) ? (
                      <div className="spinner" style={{ width: 24, height: 24, border: '2px solid #ccc', borderTopColor: '#007BFF', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <Icon name={getMimeIcon(f.type)} size={32} />
                    )}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111', textAlign: 'center', wordBreak: 'break-word', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    {itemColorTags[f.id]?.color && (
                      <span
                        className="color-tag-dot"
                        style={{ background: itemColorTags[f.id].color }}
                        title={itemColorTags[f.id].tag || 'Color badge'}
                      />
                    )}
                    {itemColorTags[f.id]?.tag && (
                      <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: `${itemColorTags[f.id].color || '#3F6B4F'}20`, color: itemColorTags[f.id].color || '#3F6B4F', fontWeight: 600 }}>
                        {itemColorTags[f.id].tag}
                      </span>
                    )}
                    <span>{f.name}</span>
                  </div>
                  {f.status === 'uploading' && (
                    <div style={{ width: '80%', height: '4px', background: '#E2E8F0', borderRadius: '2px', overflow: 'hidden', margin: '6px auto 2px' }}>
                      <div style={{ width: `${Math.max(f.progress || 5, 5)}%`, height: '100%', background: '#4F46E5', transition: 'width 0.2s' }} />
                    </div>
                  )}
                  <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px', textAlign: 'center' }}>
                    {(viewType !== 'folder' || storageFilter) && f.path && <div style={{ fontSize: '11px', color: '#8B92A0', marginBottom: '2px' }}>{f.path}/{f.name}</div>}
                    {f.status === 'uploading' ? (
                      <span style={{ color: '#4F46E5', fontWeight: 600 }}>{f.progress || 5}% Uploading</span>
                    ) : (
                      <>{formatBytes(f.size)} • {f.modifiedAt}</>
                    )}
                  </div>
                </div>

                <div className="action-row" style={{ display: 'flex', justifyContent: 'center', gap: '8px', borderTop: '1px solid #eee', paddingTop: '12px' }}>
                  {f.status !== 'trash' ? (
                    <>
                      {f.type !== 'folder' && (
                        <button className="icon-btn btn-sm" aria-label="Preview" onClick={(e) => { e.stopPropagation(); setPreviewFile(f); }} title="Preview" style={{ background: 'transparent', border: 'none' }}>
                          <Icon name="eye" size={16} />
                        </button>
                      )}
                      <button className="icon-btn btn-sm" aria-label="Download" onClick={(e) => { e.stopPropagation(); handleDownload(f.id, f.name, f.type === 'folder'); }} title="Download" style={{ background: 'transparent', border: 'none' }}>
                        <Icon name="download" size={16} />
                      </button>
                      <button className="icon-btn btn-sm" aria-label="Trash" onClick={(e) => { e.stopPropagation(); moveToTrash(f.id); }} title="Move to trash" style={{ background: 'transparent', border: 'none' }}>
                        <Icon name="trash" size={16} />
                      </button>
                    </>
                  ) : (
                    <button className="icon-btn btn-sm" aria-label="Restore" onClick={() => restoreItem(f.id)} title="Restore" style={{ background: 'transparent', border: 'none' }}>
                      <Icon name="refresh" size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </main>

      {/* Master Who Has Access & Sharing Modal */}
      {manageAccessItem && (
        <ManageAccessModal
          item={manageAccessItem}
          onClose={() => setManageAccessItem(null)}
          fetchItemShares={fetchItemShares}
          revokeItemShare={revokeItemShare}
          updateSharePermission={updateSharePermission}
          onShareWithUser={shareFileWithUser}
          onGeneratePublicLink={generatePublicLink}
          onRevokePublicLink={revokePublicLink}
        />
      )}

      {editingFileItem && (
        <FileEditorModal
          item={editingFileItem}
          onClose={() => setEditingFileItem(null)}
          onSaveContent={async (id, name, content) => {
            await updateFileContent(id, name, content);
            showToast(`Saved changes to "${name}"`);
          }}
        />
      )}

      {/* Rename Modal */}
      {renameModalItem && (
        <RenameModal
          item={renameModalItem}
          onClose={() => setRenameModalItem(null)}
          onRename={async (id, newName, isFolder) => {
            await renameItem(id, newName, isFolder);
            showToast(`Renamed to "${newName}"`);
          }}
        />
      )}

      {/* Move to Folder Modal */}
      {moveModalItem && (
        <MoveModal
          item={moveModalItem}
          onClose={() => setMoveModalItem(null)}
          fetchFolderTree={fetchFolderTree}
          onMove={async (id, targetFolderId, isFolder) => {
            await moveItem(id, targetFolderId, isFolder);
            showToast(`Item moved successfully`);
          }}
        />
      )}

      {/* Organize / Color Tag Modal */}
      {organizeModalItem && (
        <OrganizeModal
          item={organizeModalItem}
          currentColor={itemColorTags[organizeModalItem.id]?.color}
          currentTag={itemColorTags[organizeModalItem.id]?.tag}
          onClose={() => setOrganizeModalItem(null)}
          onSave={handleSaveColorTag}
        />
      )}

      {/* Details & Activity Timeline Drawer */}
      {activityDrawerItem && (
        <ActivityDrawer
          item={activityDrawerItem}
          onClose={() => setActivityDrawerItem(null)}
          fetchFileActivity={fetchFileActivity}
        />
      )}

      {uploadingFiles.length > 0 && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {Object.values(
            uploadingFiles.reduce((acc, u) => {
              if (!acc[u.batchId]) acc[u.batchId] = { id: u.batchId, files: [], progressSum: 0 };
              acc[u.batchId].files.push(u);
              acc[u.batchId].progressSum += u.progress;
              return acc;
            }, {})
          ).map(batch => {
            const totalFiles = batch.files.length;
            const completed = batch.files.filter(f => f.status === 'completed').length;
            const globalProgress = Math.round(batch.progressSum / totalFiles);
            
            const anyUploading = batch.files.some(f => f.status === 'uploading' || f.status === 'pending');
            const anyPaused = batch.files.some(f => f.status === 'paused');
            const allPaused = !anyUploading && anyPaused;
            const allDone = batch.files.every(f => f.status === 'completed' || f.status === 'cancelled' || f.status === 'error');
            const allCancelled = batch.files.every(f => f.status === 'cancelled');
            
            const isExpanded = expandedBatches[batch.id] || false;

            return (
              <div key={batch.id} className="uploads-panel" style={{
                width: '420px',
                maxWidth: '92vw',
                background: '#FFFFFF',
                borderRadius: '14px',
                boxShadow: '0 8px 32px rgba(43,42,38,0.18)',
                border: '1px solid #DEDACD',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
              }}>
                <div style={{ padding: '16px 18px', background: allCancelled ? '#FDF2F0' : allDone ? '#E8F1EB' : '#FBF9F5', borderBottom: '1px solid #DEDACD' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {anyUploading && <div className="spinner" style={{ width: 14, height: 14, border: '2px solid #DEDACD', borderTopColor: '#3F6B4F', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />}
                      {allPaused && <Icon name="pause" size={14} style={{ color: '#D97706' }} />}
                      <span style={{ fontWeight: 600, fontSize: '0.92rem', color: allCancelled ? '#A23B2E' : allDone ? '#2F4E3B' : allPaused ? '#854D0E' : '#2B2A26' }}>
                        {allCancelled ? 'Upload cancelled' : allDone ? `Completed ${completed} of ${totalFiles} items` : allPaused ? `Paused · ${completed} of ${totalFiles} complete` : `Uploading ${totalFiles} item${totalFiles !== 1 ? 's' : ''} · ${globalProgress}%`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {anyUploading && (
                        <button onClick={() => pauseBatch(batch.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#ECE7DC', border: '1px solid #DEDACD', cursor: 'pointer', padding: '5px 10px', color: '#2B2A26', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600 }}
                          title="Pause all uploads"
                        >
                          <Icon name="pause" size={12} /> Pause
                        </button>
                      )}
                      {!anyUploading && anyPaused && (
                        <button onClick={() => resumeBatch(batch.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#DCE8DF', border: '1px solid #3F6B4F', cursor: 'pointer', padding: '5px 10px', color: '#2F4E3B', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600 }}
                          title="Resume all uploads"
                        >
                          <Icon name="play" size={12} /> Resume
                        </button>
                      )}
                      {!allDone && (
                        <button onClick={() => cancelBatch(batch.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#FBEAE6', border: '1px solid rgba(162,59,46,0.25)', cursor: 'pointer', padding: '5px 10px', color: '#A23B2E', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600 }}
                          title="Cancel all & delete uploaded files"
                        >
                          <Icon name="x" size={12} /> Cancel all
                        </button>
                      )}
                      {allDone && (
                        <button onClick={dismissUploads}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', color: '#5C5A52', borderRadius: '4px' }}
                          title="Close"
                        >
                          <Icon name="x" size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="progress-track" style={{ width: '100%', height: '6px', background: '#ECE7DC', borderRadius: '3px', overflow: 'hidden' }}>
                    <div className="progress-fill" style={{ width: `${globalProgress}%`, height: '100%', background: allCancelled ? '#A23B2E' : allDone ? '#2F4E3B' : '#3F6B4F', transition: 'width 0.2s ease-out' }} />
                  </div>

                  <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: '#5C5A52' }}>
                      {allCancelled ? 'All files reverted.' : allDone ? 'All files successfully uploaded.' : `${completed} of ${totalFiles} items complete`}
                    </span>
                    <button 
                      onClick={() => setExpandedBatches(prev => ({ ...prev, [batch.id]: !prev[batch.id] }))}
                      style={{ background: 'transparent', border: 'none', color: '#3F6B4F', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      {isExpanded ? 'Fewer details' : 'More details'} <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ maxHeight: '250px', overflowY: 'auto', background: '#FFFFFF' }}>
                    {batch.files.map(u => (
                      <div key={u.id} style={{ padding: '12px 18px', borderBottom: '1px solid #EDE9DE', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Icon name={u.status === 'completed' ? 'check' : u.status === 'cancelled' ? 'x' : u.status === 'paused' ? 'pause' : 'file'} size={16} style={{ color: u.status === 'completed' ? '#3F6B4F' : u.status === 'cancelled' || u.status === 'error' ? '#A23B2E' : '#5C5A52' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 500, color: '#2B2A26', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</div>
                          <div className="progress-track" style={{ width: '100%', height: '4px', background: '#ECE7DC', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                            <div className="progress-fill" style={{ width: `${u.progress}%`, height: '100%', background: u.status === 'cancelled' || u.status === 'error' ? '#A23B2E' : u.status === 'completed' ? '#2F4E3B' : '#3F6B4F', transition: 'width 0.2s ease-out' }} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', minWidth: '40px' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: u.status === 'cancelled' || u.status === 'error' ? '#A23B2E' : u.status === 'completed' ? '#2F4E3B' : '#5C5A52' }}>
                            {u.status === 'completed' ? 'Done' : u.status === 'cancelled' ? 'Canceled' : u.status === 'error' ? 'Error' : u.status === 'paused' ? 'Paused' : `${u.progress}%`}
                          </span>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            {(u.status === 'uploading' || u.status === 'pending') && (
                              <button onClick={() => pauseUpload(u.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', color: '#5C5A52' }} title="Pause">
                                <Icon name="pause" size={12} />
                              </button>
                            )}
                            {u.status === 'paused' && (
                              <button onClick={() => resumeUpload(u.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', color: '#2F4E3B' }} title="Resume">
                                <Icon name="play" size={12} />
                              </button>
                            )}
                            {(u.status === 'uploading' || u.status === 'paused' || u.status === 'pending') && (
                              <button onClick={() => cancelUpload(u.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', color: '#A23B2E' }} title="Cancel">
                                <Icon name="x" size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {toastMessage && (
        <div className="toast-notification">
          <Icon name="check" size={16} />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
