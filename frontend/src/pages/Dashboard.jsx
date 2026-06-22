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
  const shareUrl = file.publicLinkToken ? `${window.location.origin}/api/public/files/link/${file.publicLinkToken}` : null;
  const [copied, setCopied] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [sharePermission, setSharePermission] = useState('VIEW');
  const [shareStatus, setShareStatus] = useState('');

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    onCopyLink && onCopyLink();
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
                  ? 'Anyone with the link can access.'
                  : 'No public link generated.'}
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
                    style={{ width: 'auto' }}
                  >
                    {copied
                      ? <><Icon name="check" size={14} /> Copied!</>
                      : <><Icon name="copy" size={14} /> Copy</>}
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
              <button className="btn btn-primary btn-sm" onClick={() => onGeneratePublicLink(file.id)} style={{ width: 'auto', marginTop: '10px' }}>
                Generate Public Link
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const {
    files, storage, loading,
    fetchFiles, fetchStorageStats, uploadFile, startBatch, createFolder,
    downloadFile, toggleStar, toggleShare,
    moveToTrash, restoreItem, deleteItemPermanently, uploadingFiles,
    pauseUpload, resumeUpload, cancelUpload, pauseBatch, resumeBatch, cancelBatch, dismissUploads,
    shareFileWithUser, generatePublicLink, revokePublicLink
  } = useFiles();

  const location = useLocation();
  const currentPath = location.pathname;

  // Special view type based on route
  const viewType =
    currentPath === '/trash' ? 'trash' :
    currentPath === '/starred' ? 'starred' :
    currentPath === '/shared' ? 'shared' :
    currentPath === '/recent' ? 'recent' :
    'folder';

  // Folder navigation stack: [ { id, name }, ... ]
  // id = null means root
  const [folderStack, setFolderStack] = useState([{ id: 'root', name: 'My Files' }]);
  const currentFolder = folderStack[folderStack.length - 1];

  const [view, setView] = useState('list');
  const [toastMessage, setToastMessage] = useState('');
  const [shareModal, setShareModal] = useState(null);
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
      // Always refresh storage stats when landing in files view so breakdown excludes trash
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
  }, [currentPath]);

  // Filter for special views (they return everything already filtered from the API)
  let visibleFiles = files.filter(f => {
    if (viewType === 'trash') return f.status === 'trash';
    if (viewType === 'starred') return f.starred && f.status !== 'trash';
    if (viewType === 'shared') return f.shared && f.status !== 'trash';
    return f.status !== 'trash';
  });

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

  const uploadsInCurrentFolder = uploadingFiles.filter(u => u.folderId === currentFolder.id);

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

  const ensureFolderTree = async (dirPath, cache) => {
    if (!dirPath) return currentFolder.id === 'root' ? null : currentFolder.id;
    if (cache[dirPath]) return cache[dirPath];
    const parts = dirPath.split('/');
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join('/');
    const resolvedParentId = await ensureFolderTree(parentPath, cache);
    try {
      const res = await api.post('/folders', { name, parentId: resolvedParentId });
      cache[dirPath] = res.data.id;
      return res.data.id;
    } catch { return resolvedParentId; }
  };

  const handleFolderChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArr = Array.from(e.target.files);
      const batchId = Math.random().toString(36).substr(2, 9);
      const cache = {};

      for (const file of filesArr) {
        const parts = file.webkitRelativePath.split('/');
        parts.pop();
        const dirPath = parts.join('/');
        const targetFolderId = await ensureFolderTree(dirPath, cache);
        uploadFile(file, targetFolderId, batchId);
      }

      startBatch(batchId);
      showToast(`Folder added to upload queue!`);
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
    // Only set to false if leaving the main container
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
      const batchId = Math.random().toString(36).substr(2, 9);
      const cache = {};

      for (const file of filesArr) {
        let dirPath = '';
        if (file.webkitRelativePath) {
          const parts = file.webkitRelativePath.split('/');
          parts.pop();
          dirPath = parts.join('/');
        }
        const targetFolderId = await ensureFolderTree(dirPath, cache);
        uploadFile(file, targetFolderId, batchId);
      }
      startBatch(batchId);
      showToast(`${filesArr.length} item${filesArr.length !== 1 ? 's' : ''} added to upload queue!`);
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
    currentPath === '/shared' ? 'Shared' :
    currentPath === '/storage' ? 'Storage' :
    currentPath === '/recent' ? 'Recent' :
    'Your files';

  const pageDesc =
    currentPath === '/trash' ? 'Items in trash will be permanently deleted based on your retention policy.' :
    currentPath === '/starred' ? 'Your favorite files and folders.' :
    currentPath === '/shared' ? 'Files and folders shared with you and by you.' :
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

      <Sidebar onUploadClick={handleUploadClick} onFolderUploadClick={handleFolderUploadClick} />

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
        <Topbar searchPlaceholder="Search your files…" onSearch={handleSearch} />

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
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
            {viewType === 'folder' && !storageFilter && (
              <>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleFolderUploadClick}
                  style={{ gap: '6px', display: 'flex', alignItems: 'center' }}
                >
                  <Icon name="upload" size={15} /> Upload folder
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleUploadClick}
                  style={{ gap: '6px', display: 'flex', alignItems: 'center' }}
                >
                  <Icon name="plus" size={15} /> Add file
                </button>
              </>
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
                        {(viewType !== 'folder' || storageFilter) && f.path && (
                          <div className="file-path" style={{ fontSize: '11px', color: '#8B92A0', marginTop: '2px' }}>{f.path}/{f.name}</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Visibility cell — lock or globe */}
                  <td>
                    <button
                      className={`visibility-badge ${f.shared ? 'visibility-public' : 'visibility-private'}`}
                      onClick={() => setShareModal(f)}
                      title={f.shared ? 'Public — click to manage' : 'Private — click to share'}
                    >
                      <Icon name={f.shared ? 'globe' : 'lock'} size={13} />
                      {f.shared ? 'Public' : 'Private'}
                    </button>
                  </td>

                  <td>{f.modifiedAt}</td>
                  <td>{f.type === 'folder' ? formatBytes(f.size) : formatBytes(f.size)}</td>

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
                          <button className="icon-btn" aria-label="Trash" onClick={() => moveToTrash(f.id)} title="Move to trash">
                            <Icon name="trash" size={16} />
                          </button>
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
              {uploadsInCurrentFolder.map(u => (
                <tr key={u.id} style={{ opacity: 0.7 }}>
                  <td>
                    <div className="file-name-cell">
                      <span className="file-icon-wrap"><Icon name="file" size={18} /></span>
                      <div>
                        <span>{u.name}</span>
                        <div className="file-path">Uploading... {u.progress}%</div>
                      </div>
                    </div>
                  </td>
                  <td>—</td>
                  <td>Just now</td>
                  <td>—</td>
                  <td>
                    <div className="progress-track" style={{ width: '80px', marginTop: '4px' }}>
                      <div className="progress-fill" style={{ width: `${u.progress}%` }} />
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
                <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '4px' }}>
                  <button className="icon-btn" style={{ padding: '4px', border: 'none', background: 'transparent' }} onClick={() => setShareModal(f)} title="Share">
                    <Icon name={f.shared ? 'globe' : 'lock'} size={14} />
                  </button>
                  <button className={`icon-btn star-btn ${f.starred ? 'active' : ''}`} style={{ padding: '4px', border: 'none', background: 'transparent' }} onClick={() => toggleStar(f.id)} title="Star">
                    <Icon name="star" size={14} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '16px', marginBottom: '16px' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '12px', background: f.type === 'folder' ? '#DCE8DF' : '#F4F1EA', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px', color: f.type === 'folder' ? '#3F6B4F' : '#5C5A52' }}>
                    {f.type === 'folder' && isFolderUploading(f.id) ? (
                      <div className="spinner" style={{ width: 24, height: 24, border: '2px solid #ccc', borderTopColor: '#007BFF', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <Icon name={getMimeIcon(f.type)} size={32} />
                    )}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111', textAlign: 'center', wordBreak: 'break-word', width: '100%' }}>
                    {f.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px', textAlign: 'center' }}>
                    {(viewType !== 'folder' || storageFilter) && f.path && <div style={{ fontSize: '11px', color: '#8B92A0', marginBottom: '2px' }}>{f.path}/{f.name}</div>}
                    {f.type === 'folder' ? formatBytes(f.size) : formatBytes(f.size)} • {f.modifiedAt}
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
