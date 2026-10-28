import { useEffect, useState, useRef, useCallback } from 'react';
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

// ── Share Modal ─────────────────────────────────────────────────────────────
function ShareModal({ file, onClose, onToggleShare, onCopyLink, onShareWithUser, onGeneratePublicLink, onRevokePublicLink }) {
  const shareUrl = file.publicLinkToken ? `${window.location.origin}/share/${file.publicLinkToken}` : null;
  const [copied, setCopied] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [sharePermission, setSharePermission] = useState('VIEW');
  const [shareStatus, setShareStatus] = useState('');
  const [generating, setGenerating] = useState(false);

  // Auto-generate public link immediately if file was marked shared or if token is absent
  useEffect(() => {
    if (!file.publicLinkToken && file.shared) {
      setGenerating(true);
      onGeneratePublicLink(file.id).finally(() => setGenerating(false));
    }
  }, [file.id, file.publicLinkToken, file.shared, onGeneratePublicLink]);

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    onCopyLink && onCopyLink();
  };

  const handleOpenLink = () => {
    if (!shareUrl) return;
    window.open(shareUrl, '_blank');
  };

  const handleShareSubmit = async (e) => {
    e.preventDefault();
    if (!shareEmail) return;
    try {
      await onShareWithUser(file.id, shareEmail, sharePermission);
      setShareStatus(`Shared with ${shareEmail}`);
      setShareEmail('');
      setTimeout(() => setShareStatus(''), 3000);
    } catch (err) {
      setShareStatus('Error: ' + err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3><Icon name="share" size={18} /> Share "{file.name}"</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          <div className="share-section">
            <h4>Share with a user</h4>
            <form onSubmit={handleShareSubmit} style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input type="email" placeholder="Email address" value={shareEmail} onChange={e => setShareEmail(e.target.value)} style={{ flex: 1, padding: '4px 8px' }} />
              <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '6px', padding: '2px' }}>
                <button type="button" onClick={() => setSharePermission('VIEW')} style={{ border: 'none', background: sharePermission === 'VIEW' ? '#fff' : 'transparent', padding: '4px 12px', borderRadius: '4px', fontSize: '13px', fontWeight: sharePermission === 'VIEW' ? 600 : 400, boxShadow: sharePermission === 'VIEW' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', color: '#374151' }}>View</button>
                <button type="button" onClick={() => setSharePermission('EDIT')} style={{ border: 'none', background: sharePermission === 'EDIT' ? '#fff' : 'transparent', padding: '4px 12px', borderRadius: '4px', fontSize: '13px', fontWeight: sharePermission === 'EDIT' ? 600 : 400, boxShadow: sharePermission === 'EDIT' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none', cursor: 'pointer', color: '#374151' }}>Edit</button>
              </div>
              <button type="submit" className="btn btn-primary btn-sm" style={{ width: 'auto' }}>Share</button>
            </form>
            {shareStatus && <div style={{ fontSize: '12px', color: shareStatus.startsWith('Error') ? 'red' : 'green' }}>{shareStatus}</div>}
          </div>

          <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #eee' }} />

          <div className="share-section">
            <h4>Public Link</h4>
            <div className="share-status-row">
              <span className={`status-tag ${file.publicLinkToken ? 'status-shared' : 'status-private'}`}>
                {file.publicLinkToken ? <><Icon name="globe" size={13} /> Public</> : <><Icon name="lock" size={13} /> Private</>}
              </span>
              <span className="share-status-hint">
                {file.publicLinkToken
                  ? 'Anyone with this link can view and download.'
                  : 'Generate a public link to share outside FileSphere.'}
              </span>
            </div>

            {file.publicLinkToken ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="share-link-row">
                  <div className="share-link-box">
                    <Icon name="link" size={15} />
                    <span className="share-link-text">{shareUrl}</span>
                  </div>
                  <button
                    className={`btn btn-sm ${copied ? 'btn-success' : 'btn-primary'}`}
                    onClick={handleCopy}
                    style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    {copied
                      ? <><Icon name="check" size={14} /> Copied!</>
                      : <><Icon name="copy" size={14} /> Copy</>}
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={handleOpenLink}
                    title="Open link in new tab to test"
                    style={{ width: 'auto', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Icon name="eye" size={14} /> Open
                  </button>
                </div>
                <button 
                  className="btn btn-ghost btn-sm" 
                  onClick={() => onRevokePublicLink(file.id)} 
                  style={{ width: 'auto', color: '#dc2626', alignSelf: 'flex-start' }}
                >
                  Unpublish Link
                </button>
              </div>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  setGenerating(true);
                  try {
                    await onGeneratePublicLink(file.id);
                  } finally {
                    setGenerating(false);
                  }
                }}
                disabled={generating}
                style={{ width: 'auto', marginTop: '10px' }}
              >
                {generating ? 'Generating in 0ms...' : 'Generate Public Link'}
              </button>
            )}
          </div>
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
          <p style={{ fontSize: '13px', color: '#6B7280', marginBottom: '14px' }}>
            Select destination folder:
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
            {folders.filter(f => f.id !== item.id).map(f => (
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

// ── Organize Modal (Color tag & labels) ──────────────────────────────────────
const PALETTE_COLORS = [
  { hex: '#3F6B4F', name: 'Forest Green' },
  { hex: '#D97706', name: 'Warm Amber' },
  { hex: '#A23B2E', name: 'Crimson Red' },
  { hex: '#2563EB', name: 'Ocean Blue' },
  { hex: '#7C3AED', name: 'Plum Purple' },
  { hex: '#6B7280', name: 'Slate Gray' },
];

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (item && item.type !== 'folder') {
      fetchFileActivity(item.id)
        .then(res => {
          if (active) {
            setActivities(res.activity || []);
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
      <div className="activity-drawer" onClick={e => e.stopPropagation()}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #EDE9DE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="info" size={18} style={{ color: '#3F6B4F' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#2B2A26', margin: 0 }}>Details & Activity</h3>
          </div>
          <button className="modal-close" onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '16px' }}>✕</button>
        </div>

        <div style={{ padding: '22px', flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px', padding: '14px', background: '#F4F1EA', borderRadius: '10px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3F6B4F', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
              <Icon name={item.type === 'folder' ? 'folder' : 'file'} size={24} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '14.5px', color: '#2B2A26', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
              <div style={{ fontSize: '12px', color: '#6B7280' }}>
                {item.type === 'folder' ? 'Folder' : formatBytes(item.size)} • {item.modifiedAt}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#5C5A52', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>Properties</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F5F3ED', paddingBottom: '6px' }}>
                <span style={{ color: '#8C897E' }}>Type</span>
                <span style={{ color: '#2B2A26', fontWeight: 500 }}>{item.type}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F5F3ED', paddingBottom: '6px' }}>
                <span style={{ color: '#8C897E' }}>Location</span>
                <span style={{ color: '#2B2A26', fontWeight: 500 }}>{item.path || 'My Files'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F5F3ED', paddingBottom: '6px' }}>
                <span style={{ color: '#8C897E' }}>Sharing status</span>
                <span style={{ color: item.shared ? '#3F6B4F' : '#6B7280', fontWeight: 600 }}>{item.shared ? 'Public link active' : 'Private'}</span>
              </div>
              {item.sharedBy && (
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F5F3ED', paddingBottom: '6px' }}>
                  <span style={{ color: '#8C897E' }}>Shared by</span>
                  <span style={{ color: '#2563EB', fontWeight: 600 }}>{item.sharedBy}</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#5C5A52', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon name="activity" size={15} />
              Activity Log
            </h4>

            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#8C897E', fontSize: '13px' }}>Loading timeline…</div>
            ) : activities.length === 0 ? (
              <div style={{ padding: '16px', background: '#FAF8F5', borderRadius: '8px', border: '1px solid #EDE9DE', fontSize: '12.5px', color: '#6B7280' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                  <Icon name="check" size={14} style={{ color: '#10B981' }} />
                  <span style={{ fontWeight: 600, color: '#2B2A26' }}>Created / Uploaded</span>
                </div>
                <div style={{ paddingLeft: '22px', fontSize: '11.5px', color: '#8C897E' }}>{item.modifiedAt}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
                {activities.map((act, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: act.type === 'shared' ? '#EEF2FF' : act.type === 'public_link' ? '#EBF2ED' : '#F4F1EA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: act.type === 'shared' ? '#4F46E5' : act.type === 'public_link' ? '#3F6B4F' : '#5C5A52', flexShrink: 0, marginTop: '2px' }}>
                      <Icon name={act.type === 'shared' ? 'share' : act.type === 'public_link' ? 'globe' : 'clock'} size={14} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingBottom: '10px', borderBottom: idx < activities.length - 1 ? '1px solid #EDE9DE' : 'none' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#2B2A26' }}>{act.title}</div>
                      <div style={{ fontSize: '12px', color: '#5C5A52', marginTop: '2px' }}>{act.description}</div>
                      <div style={{ fontSize: '11px', color: '#8C897E', marginTop: '4px' }}>{new Date(act.timestamp).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Item Context Menu (3-dot) ────────────────────────────────────────────────
function ItemContextMenu({ item, isFolder, onRename, onMove, onOrganize, onActivity, onStar, onShare, onDownload, onTrash, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div className="context-menu-popover" ref={menuRef} onClick={e => e.stopPropagation()}>
      <button className="context-menu-item" onClick={() => { onClose(); onRename(item); }}>
        <Icon name="edit" size={15} />
        <span>Rename</span>
      </button>
      <button className="context-menu-item" onClick={() => { onClose(); onMove(item); }}>
        <Icon name="move" size={15} />
        <span>Move to</span>
      </button>
      <button className="context-menu-item" onClick={() => { onClose(); onOrganize(item); }}>
        <Icon name="tag" size={15} />
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
      {item.type !== 'folder' && (
        <button className="context-menu-item" onClick={() => { onClose(); onShare(item); }}>
          <Icon name="share" size={15} />
          <span>Share</span>
        </button>
      )}
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

// ── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const {
    files, storage, loading,
    fetchFiles, fetchStorageStats, uploadFile, startBatch, createFolder, addOptimisticFolder,
    downloadFile, toggleStar, toggleShare,
    moveToTrash, restoreItem, deleteItemPermanently, uploadingFiles,
    pauseUpload, resumeUpload, cancelUpload, pauseBatch, resumeBatch, cancelBatch, dismissUploads,
    shareFileWithUser, generatePublicLink, revokePublicLink,
    renameItem, moveItem, fetchFolderTree, fetchFileActivity
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
  const [advancedFilters, setAdvancedFilters] = useState(null);
  const [toastMessage, setToastMessage] = useState('');
  const [shareModal, setShareModal] = useState(null);
  const [renameModalItem, setRenameModalItem] = useState(null);
  const [moveModalItem, setMoveModalItem] = useState(null);
  const [organizeModalItem, setOrganizeModalItem] = useState(null);
  const [activityDrawerItem, setActivityDrawerItem] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);

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

  // 1. Initial filter based on viewType
  let visibleFiles = files.filter(f => {
    if (viewType === 'trash') return f.status === 'trash';
    if (viewType === 'starred') return f.starred && f.status !== 'trash';
    if (viewType === 'shared-with-me') return (f.shareScope === 'with-me' || f.sharedBy) && f.status !== 'trash';
    if (viewType === 'shared-by-me') return (f.shareScope === 'by-me' || f.sharedWithUser || f.shared) && f.status !== 'trash';
    if (viewType === 'shared') return (f.shared || f.sharedBy || f.sharedWithUser) && f.status !== 'trash';
    return f.status !== 'trash';
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
        const itemDate = new Date(f.modifiedAt).getTime();
        if (isNaN(itemDate)) return true;
        const diff = now - itemDate;
        if (advancedFilters.date === 'today') return diff <= oneDay;
        if (advancedFilters.date === 'last7') return diff <= 7 * oneDay;
        if (advancedFilters.date === 'last30') return diff <= 30 * oneDay;
        if (advancedFilters.date === 'thisYear') return diff <= 365 * oneDay;
        return true;
      });
    }
  }

  // 4. Sort folders first, then files, according to selected sort criteria
  visibleFiles = [...visibleFiles].sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;

    if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'name_desc') return (b.name || '').localeCompare(a.name || '');
    if (sortBy === 'date_desc') return new Date(b.modifiedAt || 0) - new Date(a.modifiedAt || 0);
    if (sortBy === 'date_asc') return new Date(a.modifiedAt || 0) - new Date(b.modifiedAt || 0);
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
                    <span key={crumb.id}>
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

        {/* Sub-tabs for Shared Views */}
        {isSharedSection && (
          <div className="shared-subtabs" style={{ margin: '0 32px 18px' }}>
            <button
              className={`shared-subtab ${sharedSubtab === 'with-me' ? 'active' : ''}`}
              onClick={() => setSharedSubtab('with-me')}
            >
              Shared with me
            </button>
            <button
              className={`shared-subtab ${sharedSubtab === 'by-me' ? 'active' : ''}`}
              onClick={() => setSharedSubtab('by-me')}
            >
              Shared by me
            </button>
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

            {/* Sort by dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#8C897E' }}>Sort:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: '1px solid #DEDACD',
                  background: '#FFFFFF',
                  fontSize: '13px',
                  color: '#2B2A26',
                  fontWeight: 500,
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value="name_asc">Name (A → Z)</option>
                <option value="name_desc">Name (Z → A)</option>
                <option value="date_desc">Last modified (Newest)</option>
                <option value="date_asc">Last modified (Oldest)</option>
                <option value="size_desc">Size (Largest)</option>
                <option value="size_asc">Size (Smallest)</option>
              </select>
            </div>
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
          <div className="bulk-actions-toolbar" style={{ background: '#EEF2FF', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '8px', marginBottom: '16px', border: '1px solid #C7D2FE' }}>
            <span style={{ fontWeight: 600, color: '#4338CA' }}>{selectedItems.length} item{selectedItems.length > 1 ? 's' : ''} selected</span>
            <div style={{ display: 'flex', gap: '8px' }}>
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
                <button className="btn btn-sm" style={{ background: '#EF4444', color: '#fff', border: 'none' }}
                  onClick={() => handleBulkAction(moveToTrash, 'Items moved to trash')}
                >Move to Trash</button>
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
                  className={f.type === 'folder' ? 'folder-row' : ''}
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
                        onClick={() => setShareModal(f)}
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
                                item={f}
                                isFolder={f.type === 'folder'}
                                onRename={setRenameModalItem}
                                onMove={setMoveModalItem}
                                onOrganize={setOrganizeModalItem}
                                onActivity={setActivityDrawerItem}
                                onStar={toggleStar}
                                onShare={setShareModal}
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
                className="file-card" 
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
                    <button className="icon-btn" style={{ padding: '4px', border: 'none', background: 'transparent' }} onClick={() => setShareModal(f)} title="Share">
                      <Icon name={f.shared ? 'globe' : 'lock'} size={14} />
                    </button>
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
                        item={f}
                        isFolder={f.type === 'folder'}
                        onRename={setRenameModalItem}
                        onMove={setMoveModalItem}
                        onOrganize={setOrganizeModalItem}
                        onActivity={setActivityDrawerItem}
                        onStar={toggleStar}
                        onShare={setShareModal}
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

      {shareModal && (
        <ShareModal
          file={shareModal}
          onClose={() => setShareModal(null)}
          onToggleShare={(id) => {
            toggleShare(id);
            setShareModal(prev => prev ? { ...prev, shared: !prev.shared } : null);
          }}
          onShareWithUser={shareFileWithUser}
          onGeneratePublicLink={async (id) => {
            try {
              const isFolder = shareModal.type === 'folder';
              const data = await generatePublicLink(id, isFolder);
              setShareModal(prev => prev ? { ...prev, publicLinkToken: data.publicLinkToken } : null);
            } catch (err) {
              showToast(err.message || 'Error generating link');
            }
          }}
          onRevokePublicLink={async (id) => {
            try {
              const isFolder = shareModal.type === 'folder';
              await revokePublicLink(id, isFolder);
              setShareModal(prev => prev ? { ...prev, publicLinkToken: null } : null);
            } catch (err) {
              showToast(err.message || 'Error revoking link');
            }
          }}
          onCopyLink={() => {
            setToastMessage('Share link copied!');
            setTimeout(() => setToastMessage(''), 3000);
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
                width: '400px',
                background: '#fff',
                borderRadius: '8px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
                border: '1px solid #e5e7eb',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}>
                <div style={{ padding: '16px', background: allCancelled ? '#fef2f2' : allDone ? '#f0fdf4' : '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {anyUploading && <div className="spinner" style={{ width: 14, height: 14, border: '2px solid #ccc', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />}
                      {allPaused && <Icon name="pause" size={14} style={{ color: '#F59E0B' }} />}
                      <span style={{ fontWeight: 600, fontSize: '0.95rem', color: allCancelled ? '#b91c1c' : allDone ? '#166534' : allPaused ? '#92400E' : '#111827' }}>
                        {allCancelled ? 'Upload cancelled' : allDone ? `Completed ${completed} of ${totalFiles} items` : allPaused ? `Paused · ${completed} of ${totalFiles} complete` : `Uploading ${totalFiles} item${totalFiles !== 1 ? 's' : ''} · ${globalProgress}%`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      {anyUploading && (
                        <button onClick={() => pauseBatch(batch.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#F3F4F6', border: 'none', cursor: 'pointer', padding: '5px 10px', color: '#374151', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600 }}
                          title="Pause all uploads"
                        >
                          <Icon name="pause" size={13} /> Pause
                        </button>
                      )}
                      {!anyUploading && anyPaused && (
                        <button onClick={() => resumeBatch(batch.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#D1FAE5', border: 'none', cursor: 'pointer', padding: '5px 10px', color: '#065F46', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600 }}
                          title="Resume all uploads"
                        >
                          <Icon name="play" size={13} /> Resume
                        </button>
                      )}
                      {!allDone && (
                        <button onClick={() => cancelBatch(batch.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#FEE2E2', border: 'none', cursor: 'pointer', padding: '5px 10px', color: '#991B1B', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600 }}
                          title="Cancel all & delete uploaded files"
                        >
                          <Icon name="x" size={13} /> Cancel all
                        </button>
                      )}
                      {allDone && (
                        <button onClick={dismissUploads}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px', color: '#6B7280', borderRadius: '4px' }}
                          title="Close"
                        >
                          <Icon name="x" size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="progress-track" style={{ width: '100%', height: '6px', background: '#E5E7EB', borderRadius: '3px', overflow: 'hidden' }}>
                    <div className="progress-fill" style={{ width: `${globalProgress}%`, height: '100%', background: allCancelled ? '#EF4444' : allDone ? '#10B981' : '#2563EB', transition: 'width 0.2s ease-out' }} />
                  </div>

                  <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                      {allCancelled ? 'All files reverted.' : allDone ? 'All files successfully uploaded.' : `${completed} of ${totalFiles} items complete`}
                    </span>
                    <button 
                      onClick={() => setExpandedBatches(prev => ({ ...prev, [batch.id]: !prev[batch.id] }))}
                      style={{ background: 'transparent', border: 'none', color: '#2563EB', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      {isExpanded ? 'Fewer details' : 'More details'} <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ maxHeight: '250px', overflowY: 'auto', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
                    {batch.files.map(u => (
                      <div key={u.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Icon name={u.status === 'completed' ? 'check' : u.status === 'cancelled' ? 'x' : u.status === 'paused' ? 'pause' : 'file'} size={16} style={{ color: u.status === 'completed' ? '#10B981' : u.status === 'cancelled' || u.status === 'error' ? '#EF4444' : '#6B7280' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 500, color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</div>
                          <div className="progress-track" style={{ width: '100%', height: '4px', background: '#E5E7EB', borderRadius: '2px', marginTop: '6px', overflow: 'hidden' }}>
                            <div className="progress-fill" style={{ width: `${u.progress}%`, height: '100%', background: u.status === 'cancelled' || u.status === 'error' ? '#EF4444' : u.status === 'completed' ? '#10B981' : '#4338CA', transition: 'width 0.2s ease-out' }} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', minWidth: '35px' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: u.status === 'cancelled' ? '#EF4444' : u.status === 'error' ? '#EF4444' : '#6B7280' }}>
                            {u.status === 'completed' ? 'Done' : u.status === 'cancelled' ? 'Canceled' : u.status === 'error' ? 'Error' : u.status === 'paused' ? 'Paused' : `${u.progress}%`}
                          </span>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            {(u.status === 'uploading' || u.status === 'pending') && (
                              <button onClick={() => pauseUpload(u.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', color: '#6B7280' }} title="Pause">
                                <Icon name="pause" size={12} />
                              </button>
                            )}
                            {u.status === 'paused' && (
                              <button onClick={() => resumeUpload(u.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', color: '#10B981' }} title="Resume">
                                <Icon name="play" size={12} />
                              </button>
                            )}
                            {(u.status === 'uploading' || u.status === 'paused' || u.status === 'pending') && (
                              <button onClick={() => cancelUpload(u.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', color: '#EF4444' }} title="Cancel">
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
