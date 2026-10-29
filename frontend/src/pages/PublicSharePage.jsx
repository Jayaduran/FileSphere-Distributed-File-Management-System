import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import Icon from '../components/Icon';
import { useAuth } from '../context/useAuth';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileCategory(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf')) return 'pdf';
  if (
    mimeType.includes('text') ||
    mimeType.includes('json') ||
    mimeType.includes('javascript') ||
    mimeType.includes('html') ||
    mimeType.includes('xml')
  ) {
    return 'text';
  }
  return 'other';
}

function cleanTokenString(raw) {
  if (!raw) return '';
  let token = raw.trim();
  if (token.includes('/share/')) {
    token = token.split('/share/').pop().split('?')[0].split('/')[0];
  } else if (token.includes('/link/')) {
    token = token.split('/link/').pop().split('?')[0].split('/')[0];
  }
  return token.replace(/\/+$/, '').trim();
}

export default function PublicSharePage() {
  const { token: routeToken } = useParams();
  const [searchParams] = useSearchParams();
  const token = routeToken || searchParams.get('token') || searchParams.get('id') || '';
  const navigate = useNavigate();
  const { user, login } = useAuth();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [restrictedInfo, setRestrictedInfo] = useState(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [manualToken, setManualToken] = useState('');

  // Authentication Required Modal (for unauthenticated users attempting edit)
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Edit Modal (for authenticated users with EDIT permissions)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editContentLoading, setEditContentLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Preview file inside folder modal
  const [previewSubfile, setPreviewSubfile] = useState(null);

  // Collaborative Folder Actions (Upload & Create Folder in Public Folder)
  const publicFileInputRef = useRef(null);
  const [publicUploading, setPublicUploading] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [activeSubfolderId, setActiveSubfolderId] = useState(null);

  // Ask for Edit Access state
  const [showRequestAccessModal, setShowRequestAccessModal] = useState(false);
  const [requestEmail, setRequestEmail] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [requestSending, setRequestSending] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [requestError, setRequestError] = useState(null);

  const fetchItem = useCallback(async (targetSubfolderId = null) => {
    if (!token) {
      setLoading(false);
      setError('Please provide a share link or token to view.');
      return;
    }
    const cleanToken = cleanTokenString(token);
    setLoading(true);
    setError(null);
    setRestrictedInfo(null);

    const params = new URLSearchParams();
    if (targetSubfolderId) params.set('subfolderId', targetSubfolderId);
    const modeParam = searchParams.get('mode') || searchParams.get('permission');
    if (modeParam) params.set('mode', modeParam);
    const queryParam = params.toString() ? `?${params.toString()}` : '';

    try {
      const res = await api.get(`/public/files/link/${encodeURIComponent(cleanToken)}/info${queryParam}`);
      setData(res.data);
      setActiveSubfolderId(targetSubfolderId);
      setRestrictedInfo(null);
    } catch (err) {
      console.error('Fetch public item error:', err);
      if (err.response?.data?.tampered) {
        setError(err.response?.data?.message || 'Security Alert: Tampered or invalid share link. Unauthorized access attempt blocked.');
        setRestrictedInfo(null);
      } else if (err.response?.status === 403 || err.response?.data?.restricted) {
        setRestrictedInfo(err.response.data);
        setError(null);
      } else {
        const msg = err.response?.data?.message || 'Link is invalid or has expired';
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [token, searchParams]);

  useEffect(() => {
    fetchItem(null);
  }, [fetchItem]);

  const handleTriggerUpload = () => {
    if (!user) {
      setAuthError('Please sign in to your FileSphere account to add files to this shared folder.');
      setShowAuthModal(true);
      return;
    }
    publicFileInputRef.current?.click();
  };

  const handleTriggerNewFolder = () => {
    if (!user) {
      setAuthError('Please sign in to your FileSphere account to create folders in this shared folder.');
      setShowAuthModal(true);
      return;
    }
    setShowNewFolderModal(true);
  };

  const handlePublicFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!user) {
      setAuthError('Please sign in to add files to this shared folder.');
      setShowAuthModal(true);
      return;
    }
    setPublicUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    if (activeSubfolderId) {
      formData.append('folderId', activeSubfolderId);
    }
    try {
      const cleanToken = cleanTokenString(token);
      const res = await api.post(`/public/folders/link/${encodeURIComponent(cleanToken)}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showToast(`Uploaded "${file.name}" successfully!`);
      await fetchItem(activeSubfolderId);
    } catch (err) {
      console.error('Failed to upload file to shared folder:', err);
      if (err.response?.status === 401) {
        setAuthError('Please sign in to your FileSphere account to add files to this shared folder.');
        setShowAuthModal(true);
      } else {
        showToast(err.response?.data?.message || 'Failed to upload file to shared folder.');
      }
    } finally {
      setPublicUploading(false);
      if (publicFileInputRef.current) publicFileInputRef.current.value = '';
    }
  };

  const handlePublicCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    if (!user) {
      setAuthError('Please sign in to your FileSphere account to create folders in this shared folder.');
      setShowAuthModal(true);
      return;
    }
    setCreatingFolder(true);
    try {
      const cleanToken = cleanTokenString(token);
      await api.post(`/public/folders/link/${encodeURIComponent(cleanToken)}/create-folder`, {
        name: newFolderName.trim(),
        parentId: activeSubfolderId || data?.item?.id,
      });
      showToast(`Created folder "${newFolderName.trim()}"!`);
      setShowNewFolderModal(false);
      setNewFolderName('');
      await fetchItem(activeSubfolderId);
    } catch (err) {
      console.error('Failed to create subfolder:', err);
      if (err.response?.status === 401) {
        setAuthError('Please sign in to your FileSphere account to create folders in this shared folder.');
        setShowAuthModal(true);
      } else {
        showToast(err.response?.data?.message || 'Failed to create subfolder.');
      }
    } finally {
      setCreatingFolder(false);
    }
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const getDownloadUrl = (isView = false) => {
    const cleanToken = cleanTokenString(token);
    const base = API_BASE_URL.replace(/\/$/, '');
    const param = isView ? '?view=1' : '';
    return `${base}/public/files/link/${encodeURIComponent(cleanToken)}${param}`;
  };

  const getSubfileUrl = (fileId, isView = false) => {
    const base = API_BASE_URL.replace(/\/$/, '');
    const param = isView ? '?view=1' : '';
    return `${base}/public/files/${fileId}/download${param}`;
  };

  const handleDownload = () => {
    if (!token) return;
    setDownloading(true);
    const downloadEndpoint = getDownloadUrl(false);

    const link = document.createElement('a');
    link.href = downloadEndpoint;
    link.setAttribute('download', '');
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => setDownloading(false), 2000);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    const target = cleanTokenString(manualToken);
    navigate(`/share/${encodeURIComponent(target)}`);
  };

  // Open Edit action: verifies user login first
  const handleOpenEdit = async () => {
    if (!user) {
      setAuthError('Please sign in to your FileSphere account to edit this item.');
      setShowAuthModal(true);
      return;
    }

    setEditName(data?.item?.name || '');
    setEditError(null);
    setShowEditModal(true);

    // If it's a text file, attempt to load text content for inline editing
    if (data?.type === 'file' && getFileCategory(data.item.mimeType) === 'text') {
      setEditContentLoading(true);
      try {
        const textRes = await fetch(getDownloadUrl(true));
        const txt = await textRes.text();
        setEditContent(txt);
      } catch (e) {
        console.error('Error fetching text for edit:', e);
        setEditContent('');
      } finally {
        setEditContentLoading(false);
      }
    } else {
      setEditContent('');
    }
  };

  // Quick Sign In from share page
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword) {
      setAuthError('Please enter both email and password.');
      return;
    }
    setAuthSubmitting(true);
    setAuthError(null);
    try {
      await login({ email: authEmail.trim(), password: authPassword });
      setShowAuthModal(false);
      showToast('Logged in successfully!');
      await fetchItem(activeSubfolderId);
      setTimeout(() => {
        handleOpenEdit();
      }, 300);
    } catch (err) {
      setAuthError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  // Save changes from Edit Modal
  const handleSaveEdit = async () => {
    if (!editName.trim()) {
      setEditError('Name cannot be empty.');
      return;
    }
    setEditSaving(true);
    setEditError(null);

    try {
      const cleanToken = cleanTokenString(token);
      if (data.type === 'file') {
        const payload = {
          name: editName.trim(),
          ...(getFileCategory(data.item.mimeType) === 'text' && editContent !== '' ? { content: editContent } : {}),
        };

        try {
          await api.patch(`/public/files/link/${encodeURIComponent(cleanToken)}/content`, payload);
        } catch (ePublic) {
          if (getFileCategory(data.item.mimeType) === 'text' && editContent !== '') {
            await api.patch(`/files/${data.item.id}/content`, payload);
          } else {
            await api.patch(`/files/${data.item.id}/rename`, { name: editName.trim() });
          }
        }
      } else {
        // Rename folder
        await api.patch(`/folders/${data.item.id}/rename`, {
          name: editName.trim(),
        });
      }

      // Update state locally and re-fetch from server
      setData((prev) => ({
        ...prev,
        item: {
          ...prev.item,
          name: editName.trim(),
        },
      }));

      setShowEditModal(false);
      showToast('Changes saved successfully and reflected immediately!');
      await fetchItem(activeSubfolderId);
    } catch (err) {
      console.error('Error saving edits:', err);
      const msg = err.response?.data?.message || 'Failed to save changes. Make sure you have permission.';
      setEditError(msg);
    } finally {
      setEditSaving(false);
    }
  };

  const handleOpenRequestAccess = () => {
    setRequestError(null);
    if (user?.email) {
      setRequestEmail(user.email);
    }
    setShowRequestAccessModal(true);
  };

  const handleSubmitRequestAccess = async (e) => {
    e.preventDefault();
    const emailToUse = (user?.email || requestEmail || '').trim();
    if (!emailToUse || !emailToUse.includes('@')) {
      setRequestError('Please provide a valid email address so the owner can grant you access.');
      return;
    }
    setRequestSending(true);
    setRequestError(null);
    try {
      const cleanToken = cleanTokenString(token);
      await api.post(`/public/files/link/${encodeURIComponent(cleanToken)}/request-access`, {
        email: emailToUse,
        message: requestNote.trim(),
      });
      setRequestSent(true);
      setShowRequestAccessModal(false);
      showToast('Edit access request sent to the owner!');
    } catch (err) {
      console.error('Request access error:', err);
      setRequestError(err.response?.data?.message || 'Failed to submit request. Please try again.');
    } finally {
      setRequestSending(false);
    }
  };

  const requestedMode = (searchParams.get('mode') || searchParams.get('permission') || '').toLowerCase();
  const isFolder = data?.type === 'folder';
  const allowsDownload = data?.item?.allowDownload !== false;
  const allowsEdit = requestedMode === 'view' ? false : data?.item?.permission === 'EDIT';

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F4F1EA',
        color: '#2B2A26',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            backgroundColor: '#2F4E3B',
            color: '#FFFFFF',
            padding: '12px 20px',
            borderRadius: '10px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            fontWeight: 600,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <Icon name="check" size={16} />
          {toastMessage}
        </div>
      )}

      {/* Top Navbar */}
      <header
        style={{
          padding: '16px 36px',
          borderBottom: '1px solid #DEDACD',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 3px rgba(43,42,38,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: '#3F6B4F',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '15px',
              letterSpacing: '0.5px',
              boxShadow: '0 2px 6px rgba(63, 107, 79, 0.3)',
            }}
          >
            FS
          </div>
          <div>
            <div
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontWeight: 700,
                fontSize: '20px',
                letterSpacing: '-0.2px',
                color: '#2B2A26',
                lineHeight: 1.1,
              }}
            >
              FileSphere
            </div>
            <div style={{ fontSize: '11px', color: '#5C5A52', marginTop: '2px', letterSpacing: '0.02em' }}>
              Distributed Cloud File System
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  color: '#2B2A26',
                  fontWeight: 600,
                }}
              >
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    backgroundColor: '#DCE8DF',
                    color: '#2F4E3B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '12px',
                  }}
                >
                  {user.name ? user.name[0].toUpperCase() : 'U'}
                </div>
                <span>{user.name}</span>
              </div>
              <Link
                to="/dashboard"
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#FFFFFF',
                  textDecoration: 'none',
                  backgroundColor: '#3F6B4F',
                  boxShadow: '0 2px 6px rgba(63, 107, 79, 0.25)',
                }}
              >
                Go to Dashboard
              </Link>
            </div>
          ) : (
            <>
              <Link
                to={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#2B2A26',
                  textDecoration: 'none',
                  border: '1px solid #DEDACD',
                  backgroundColor: '#FFFFFF',
                }}
              >
                Sign In
              </Link>
              <Link
                to="/signup"
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#FFFFFF',
                  textDecoration: 'none',
                  backgroundColor: '#3F6B4F',
                  boxShadow: '0 2px 6px rgba(63, 107, 79, 0.25)',
                }}
              >
                Get Started Free
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
        }}
      >
        {/* Loading State */}
        {loading && (
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '22px',
              border: '1px solid #DEDACD',
              padding: '48px 40px',
              textAlign: 'center',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 1px 2px rgba(43,42,38,0.04), 0 8px 24px rgba(43,42,38,0.06)',
            }}
          >
            <div
              style={{
                width: '44px',
                height: '44px',
                border: '3px solid #DCE8DF',
                borderTopColor: '#3F6B4F',
                borderRadius: '50%',
                margin: '0 auto 20px',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <h3
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: '20px',
                fontWeight: 600,
                color: '#2B2A26',
                marginBottom: '8px',
              }}
            >
              Retrieving Shared Content...
            </h3>
            <p style={{ fontSize: '13px', color: '#5C5A52' }}>
              Connecting to FileSphere storage node in fraction of a second.
            </p>
          </div>
        )}

        {/* Restricted Link Access State */}
        {!loading && restrictedInfo && (
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '22px',
              border: '1px solid #DEDACD',
              padding: '44px 36px',
              textAlign: 'center',
              maxWidth: '540px',
              width: '100%',
              boxShadow: '0 1px 2px rgba(43,42,38,0.04), 0 8px 24px rgba(43,42,38,0.06)',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: '#FBEAE6',
                color: '#A23B2E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 18px',
                border: '1px solid rgba(162, 59, 46, 0.25)',
              }}
            >
              <Icon name="lock" size={28} />
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '999px',
                backgroundColor: '#FBEAE6',
                color: '#A23B2E',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginBottom: '14px',
              }}
            >
              Restricted Access
            </div>

            <h2
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: '22px',
                fontWeight: 700,
                color: '#2B2A26',
                marginBottom: '10px',
              }}
            >
              {restrictedInfo.name ? `"${restrictedInfo.name}" is Restricted` : 'Access Restricted'}
            </h2>

            <p style={{ fontSize: '14px', color: '#5C5A52', lineHeight: 1.6, marginBottom: '20px' }}>
              {restrictedInfo.message || 'This item is restricted. Access is only allowed for invited collaborators and the owner.'}
            </p>

            {user ? (
              <div
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  backgroundColor: '#FBF9F5',
                  border: '1px solid #EDE9DE',
                  marginBottom: '24px',
                  fontSize: '13px',
                  color: '#5C5A52',
                }}
              >
                Signed in as <b style={{ color: '#2B2A26' }}>{user.email}</b>. This account does not have collaborator permission for this item.
              </div>
            ) : (
              <div
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  backgroundColor: '#FBF9F5',
                  border: '1px solid #EDE9DE',
                  marginBottom: '24px',
                  fontSize: '13px',
                  color: '#5C5A52',
                }}
              >
                Owner: <b style={{ color: '#2B2A26' }}>{restrictedInfo.owner || 'FileSphere User'}</b>. Please sign in with your invited FileSphere account.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              {user ? (
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button
                    onClick={() => {
                      localStorage.removeItem('token');
                      window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
                    }}
                    style={{
                      padding: '11px 22px',
                      borderRadius: '8px',
                      backgroundColor: '#3F6B4F',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Switch Account
                  </button>
                  <Link
                    to="/dashboard"
                    style={{
                      padding: '11px 20px',
                      borderRadius: '8px',
                      backgroundColor: '#ECE7DC',
                      color: '#2B2A26',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: 600,
                      border: '1px solid #DEDACD',
                    }}
                  >
                    Go to Dashboard
                  </Link>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <Link
                    to={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}
                    style={{
                      padding: '11px 24px',
                      borderRadius: '8px',
                      backgroundColor: '#3F6B4F',
                      color: '#FFFFFF',
                      textDecoration: 'none',
                      fontSize: '14px',
                      fontWeight: 600,
                      boxShadow: '0 2px 6px rgba(63, 107, 79, 0.25)',
                    }}
                  >
                    Sign In to Access
                  </Link>
                  <Link
                    to="/signup"
                    style={{
                      padding: '11px 20px',
                      borderRadius: '8px',
                      backgroundColor: '#ECE7DC',
                      color: '#2B2A26',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: 600,
                      border: '1px solid #DEDACD',
                    }}
                  >
                    Create Account
                  </Link>
                </div>
              )}
            </div>

            <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Have another share link or token?..."
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #DEDACD',
                  color: '#2B2A26',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  backgroundColor: '#ECE7DC',
                  color: '#2B2A26',
                  border: '1px solid #DEDACD',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Go
              </button>
            </form>
          </div>
        )}

        {/* Error / Invalid Link State */}
        {!loading && !restrictedInfo && error && (
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '22px',
              border: '1px solid #DEDACD',
              padding: '44px 36px',
              textAlign: 'center',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 1px 2px rgba(43,42,38,0.04), 0 8px 24px rgba(43,42,38,0.06)',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#FBEAE6',
                color: '#A23B2E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 18px',
                fontSize: '24px',
                border: '1px solid rgba(162, 59, 46, 0.2)',
              }}
            >
              <Icon name="x" size={24} />
            </div>
            <h2
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: '22px',
                fontWeight: 700,
                color: error?.includes('Security') || error?.includes('Tampered') ? '#A23B2E' : '#2B2A26',
                marginBottom: '10px',
              }}
            >
              {error?.includes('Security') || error?.includes('Tampered')
                ? 'Tampered Share Link Detected'
                : 'Link Invalid or Not Found'}
            </h2>
            <p style={{ fontSize: '14px', color: '#5C5A52', lineHeight: 1.6, marginBottom: '24px' }}>
              {error?.includes('Security') || error?.includes('Tampered')
                ? error
                : (error?.includes('trash')
                  ? 'This shared item was moved to the trash by the owner.'
                  : "The link you entered doesn't match any active public file or folder on FileSphere.")}
            </p>

            <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
              <input
                type="text"
                placeholder="Enter share link or token..."
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  borderRadius: '8px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #DEDACD',
                  color: '#2B2A26',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '11px 20px',
                  borderRadius: '8px',
                  backgroundColor: '#3F6B4F',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 120ms ease',
                }}
              >
                Access
              </button>
            </form>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <Link
                to="/"
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  backgroundColor: '#ECE7DC',
                  color: '#2B2A26',
                  textDecoration: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: '1px solid #DEDACD',
                }}
              >
                Go to FileSphere Home
              </Link>
            </div>
          </div>
        )}

        {/* Success Shared Item Display */}
        {!loading && data && data.item && (
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '22px',
              border: '1px solid #DEDACD',
              padding: '36px',
              maxWidth: '720px',
              width: '100%',
              boxShadow: '0 1px 2px rgba(43,42,38,0.04), 0 8px 24px rgba(43,42,38,0.06)',
            }}
          >
            {/* Header info badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px',
                paddingBottom: '16px',
                borderBottom: '1px solid #DEDACD',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    padding: '4px 12px',
                    borderRadius: '999px',
                    backgroundColor: '#DCE8DF',
                    border: '1px solid #3F6B4F',
                    color: '#2F4E3B',
                    fontSize: '12px',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Icon name="globe" size={13} /> Public Share
                </span>

                {/* Permission Badge */}
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '999px',
                    backgroundColor: allowsEdit ? '#E8F1EB' : '#F4F1EA',
                    border: '1px solid ' + (allowsEdit ? '#3F6B4F' : '#DEDACD'),
                    color: allowsEdit ? '#2F4E3B' : '#5C5A52',
                    fontSize: '11px',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Icon name={allowsEdit ? 'edit' : 'eye'} size={12} />
                  {allowsEdit ? 'Can Edit' : 'View Only'}
                </span>

                {!allowsEdit && (
                  <button
                    type="button"
                    onClick={handleOpenRequestAccess}
                    title="Ask file owner for edit permissions"
                    style={{
                      padding: '4px 10px',
                      borderRadius: '999px',
                      backgroundColor: requestSent ? '#DCE8DF' : '#FFFFFF',
                      border: '1px solid #3F6B4F',
                      color: '#2F4E3B',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      boxShadow: '0 1px 3px rgba(63, 107, 79, 0.1)',
                      transition: 'all 120ms ease',
                    }}
                  >
                    <Icon name={requestSent ? "check" : "userPlus"} size={12} />
                    {requestSent ? 'Edit Access Requested' : 'Ask for Edit Access'}
                  </button>
                )}

                <span style={{ fontSize: '13px', color: '#5C5A52', marginLeft: '4px' }}>
                  By <b style={{ color: '#2B2A26' }}>{data.item.owner || 'FileSphere User'}</b>
                </span>
              </div>

              <div style={{ fontSize: '12px', color: '#5C5A52' }}>
                {new Date(data.item.createdAt).toLocaleDateString()}
              </div>
            </div>

            {/* Media / File / Folder Preview */}
            <div
              style={{
                backgroundColor: '#F4F1EA',
                borderRadius: '14px',
                border: '1px solid #DEDACD',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '24px',
                minHeight: '200px',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {data.type === 'file' && getFileCategory(data.item.mimeType) === 'image' ? (
                <div style={{ maxWidth: '100%', textAlign: 'center' }}>
                  <img
                    src={getDownloadUrl(true)}
                    alt={data.item.name}
                    style={{
                      maxHeight: '340px',
                      maxWidth: '100%',
                      borderRadius: '8px',
                      objectFit: 'contain',
                      boxShadow: '0 4px 12px rgba(43,42,38,0.1)',
                      border: '1px solid #DEDACD',
                    }}
                  />
                </div>
              ) : data.type === 'file' && getFileCategory(data.item.mimeType) === 'video' ? (
                <video
                  controls
                  src={getDownloadUrl(true)}
                  style={{
                    maxHeight: '340px',
                    maxWidth: '100%',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(43,42,38,0.1)',
                  }}
                />
              ) : data.type === 'file' && getFileCategory(data.item.mimeType) === 'audio' ? (
                <div style={{ width: '100%', padding: '20px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎵</div>
                  <audio controls src={getDownloadUrl(true)} style={{ width: '100%', maxWidth: '400px' }} />
                </div>
              ) : isFolder ? (
                <div style={{ textAlign: 'center', padding: '10px 0', width: '100%' }}>
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '16px',
                      backgroundColor: '#DCE8DF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#2F4E3B',
                      margin: '0 auto 14px',
                      boxShadow: '0 2px 8px rgba(47, 78, 59, 0.15)',
                    }}
                  >
                    <Icon name="folder" size={34} />
                  </div>
                  <h4
                    style={{
                      fontFamily: "Georgia, 'Times New Roman', serif",
                      fontSize: '20px',
                      fontWeight: 600,
                      color: '#2B2A26',
                      marginBottom: '6px',
                    }}
                  >
                    {data.item.name}
                  </h4>
                  <div style={{ fontSize: '13px', color: '#5C5A52', marginBottom: '12px' }}>
                    {data.item.files?.length || 0} files • {data.item.subfolders?.length || 0} subfolders
                  </div>

                  {/* Hierarchical Breadcrumbs navigation */}
                  {data.item.breadcrumbs && data.item.breadcrumbs.length > 1 && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        marginBottom: '14px',
                        flexWrap: 'wrap',
                      }}
                    >
                      {data.item.breadcrumbs.map((bc, idx) => {
                        const isCurrent = idx === data.item.breadcrumbs.length - 1;
                        return (
                          <div key={bc.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {idx > 0 && <span style={{ color: '#8C897E', fontSize: '12px' }}>›</span>}
                            <button
                              type="button"
                              onClick={() => fetchItem(bc.id === data.item.rootId ? null : bc.id)}
                              disabled={isCurrent}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
                                borderRadius: '6px',
                                border: isCurrent ? '1px solid #3F6B4F' : '1px solid #DEDACD',
                                backgroundColor: isCurrent ? '#DCE8DF' : '#FFFFFF',
                                color: isCurrent ? '#2F4E3B' : '#5C5A52',
                                fontSize: '12px',
                                fontWeight: isCurrent ? 700 : 500,
                                cursor: isCurrent ? 'default' : 'pointer',
                                transition: 'all 120ms ease',
                              }}
                            >
                              <span>📁</span>
                              <span>{bc.name}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Public Folder Action Bar: Upload File & New Subfolder ONLY when allowsEdit is true */}
                  {allowsEdit ? (
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
                      <input
                        type="file"
                        ref={publicFileInputRef}
                        style={{ display: 'none' }}
                        onChange={handlePublicFileUpload}
                      />
                      <button
                        type="button"
                        onClick={handleTriggerUpload}
                        disabled={publicUploading}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          backgroundColor: '#3F6B4F',
                          color: '#FFFFFF',
                          border: 'none',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: publicUploading ? 'not-allowed' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 6px rgba(63, 107, 79, 0.25)',
                          transition: 'all 120ms ease',
                        }}
                      >
                        <Icon name="upload" size={14} />
                        {publicUploading ? 'Uploading File...' : 'Upload File to Folder'}
                      </button>
                      <button
                        type="button"
                        onClick={handleTriggerNewFolder}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          backgroundColor: '#FFFFFF',
                          color: '#2B2A26',
                          border: '1px solid #DEDACD',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 120ms ease',
                        }}
                      >
                        <Icon name="folder" size={14} />
                        New Subfolder
                      </button>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: '999px',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #DEDACD',
                        color: '#5C5A52',
                        fontSize: '12px',
                        fontWeight: 600,
                        marginBottom: '16px',
                      }}
                    >
                      <Icon name="eye" size={13} />
                      <span>View only • Editing and adding files are disabled</span>
                    </div>
                  )}

                  {/* Subfolders list if any */}
                  {data.item.subfolders && data.item.subfolders.length > 0 && (
                    <div
                      style={{
                        marginBottom: '12px',
                        textAlign: 'left',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #DEDACD',
                        borderRadius: '10px',
                        padding: '8px 12px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: '#5C5A52',
                          paddingBottom: '6px',
                          letterSpacing: '0.04em',
                          borderBottom: '1px solid #F4F1EA',
                          marginBottom: '8px',
                        }}
                      >
                        Subfolders ({data.item.subfolders.length})
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
                        {data.item.subfolders.map((sf) => (
                          <button
                            type="button"
                            key={sf.id}
                            onClick={() => fetchItem(sf.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '6px',
                              padding: '8px 12px',
                              backgroundColor: '#F4F1EA',
                              borderRadius: '8px',
                              border: '1px solid #DEDACD',
                              fontSize: '12px',
                              fontWeight: 600,
                              color: '#2B2A26',
                              cursor: 'pointer',
                              transition: 'all 120ms ease',
                              textAlign: 'left',
                            }}
                            title={`Browse ${sf.name}`}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', minWidth: 0 }}>
                              <span>📁</span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sf.name}</span>
                            </div>
                            <span style={{ color: '#8C897E', fontSize: '13px', flexShrink: 0 }}>›</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* List of files in public folder */}
                  {data.item.files && data.item.files.length > 0 ? (
                    <div
                      style={{
                        marginTop: '12px',
                        maxHeight: '220px',
                        overflowY: 'auto',
                        textAlign: 'left',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #DEDACD',
                        borderRadius: '10px',
                        padding: '6px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: '#5C5A52',
                          padding: '6px 10px',
                          letterSpacing: '0.04em',
                          borderBottom: '1px solid #F4F1EA',
                        }}
                      >
                        Public Files Inside This Folder ({data.item.files.length})
                      </div>
                      {data.item.files.map((f) => (
                        <div
                          key={f.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '13px',
                            padding: '8px 10px',
                            borderBottom: '1px solid #F4F1EA',
                            gap: '12px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                            }}
                          >
                            <span style={{ fontSize: '15px' }}>📄</span>
                            <span
                              style={{
                                color: '#2B2A26',
                                fontWeight: 500,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {f.name}
                            </span>
                            <span style={{ color: '#5C5A52', fontSize: '11px', flexShrink: 0 }}>
                              ({formatBytes(f.size)})
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            {/* Preview button for any file */}
                            <button
                              onClick={() => setPreviewSubfile(f)}
                              style={{
                                padding: '4px 10px',
                                borderRadius: '6px',
                                backgroundColor: '#ECE7DC',
                                border: '1px solid #DEDACD',
                                color: '#2B2A26',
                                fontSize: '11px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <Icon name="eye" size={11} /> Preview
                            </button>

                            {/* Download button if allowed */}
                            {allowsDownload && (
                              <a
                                href={getSubfileUrl(f.id, false)}
                                download
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  backgroundColor: '#DCE8DF',
                                  border: '1px solid #3F6B4F',
                                  color: '#2F4E3B',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  textDecoration: 'none',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                                title="Download this file"
                              >
                                <Icon name="download" size={11} />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#5C5A52', padding: '12px 0' }}>
                      Folder is empty
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '16px',
                      backgroundColor: '#DCE8DF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#3F6B4F',
                      margin: '0 auto 16px',
                      boxShadow: '0 2px 8px rgba(63, 107, 79, 0.15)',
                    }}
                  >
                    <Icon name="file" size={32} />
                  </div>
                  <h4
                    style={{
                      fontFamily: "Georgia, 'Times New Roman', serif",
                      fontSize: '20px',
                      fontWeight: 600,
                      color: '#2B2A26',
                      marginBottom: '6px',
                      wordBreak: 'break-all',
                      maxWidth: '460px',
                    }}
                  >
                    {data.item.name}
                  </h4>
                  <div style={{ fontSize: '13px', color: '#5C5A52' }}>
                    {formatBytes(data.item.size)} • {data.item.mimeType || 'Binary file'}
                  </div>
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Main Download */}
              <button
                onClick={handleDownload}
                disabled={downloading}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '10px',
                  backgroundColor: downloading ? '#5C5A52' : '#3F6B4F',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: downloading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  boxShadow: '0 2px 8px rgba(63, 107, 79, 0.25)',
                  transition: 'background 120ms ease',
                }}
              >
                <Icon name="download" size={18} />
                {downloading
                  ? 'Starting Download...'
                  : isFolder
                  ? `Download Entire Folder as ZIP (${formatBytes(data.item.size)})`
                  : `Download File (${formatBytes(data.item.size)})`}
              </button>

              {/* Secondary Row: Edit Button (if allowed), Copy Link, View Raw */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {/* Edit Button if permission allows */}
                {allowsEdit && (
                  <button
                    onClick={handleOpenEdit}
                    style={{
                      flex: 1,
                      minWidth: '140px',
                      padding: '11px',
                      borderRadius: '8px',
                      backgroundColor: '#3F6B4F',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 2px 6px rgba(63, 107, 79, 0.2)',
                    }}
                  >
                    <Icon name="edit" size={15} />
                    {user ? `Edit ${isFolder ? 'Folder' : 'File'}` : `Sign In to Edit`}
                  </button>
                )}

                {/* Ask for Edit Access Button if View Only */}
                {!allowsEdit && (
                  <button
                    type="button"
                    onClick={handleOpenRequestAccess}
                    style={{
                      flex: 1,
                      minWidth: '160px',
                      padding: '11px',
                      borderRadius: '8px',
                      backgroundColor: requestSent ? '#DCE8DF' : '#FFFFFF',
                      color: '#2F4E3B',
                      border: '1px solid #3F6B4F',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 1px 3px rgba(63, 107, 79, 0.12)',
                      transition: 'all 120ms ease',
                    }}
                  >
                    <Icon name={requestSent ? "check" : "userPlus"} size={15} />
                    {requestSent ? 'Edit Access Requested' : 'Ask for Edit Access'}
                  </button>
                )}

                <button
                  onClick={handleCopyLink}
                  style={{
                    flex: 1,
                    minWidth: '140px',
                    padding: '11px',
                    borderRadius: '8px',
                    backgroundColor: copied ? '#DCE8DF' : '#FFFFFF',
                    color: copied ? '#2F4E3B' : '#2B2A26',
                    border: '1px solid ' + (copied ? '#3F6B4F' : '#DEDACD'),
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 120ms ease',
                  }}
                >
                  <Icon name={copied ? 'check' : 'copy'} size={15} />
                  {copied ? 'Share Link Copied!' : 'Copy Share Link'}
                </button>

                {!isFolder && (
                  <a
                    href={getDownloadUrl(true)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '11px 16px',
                      borderRadius: '8px',
                      backgroundColor: '#FFFFFF',
                      color: '#2B2A26',
                      border: '1px solid #DEDACD',
                      fontSize: '13px',
                      fontWeight: 600,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    <Icon name="eye" size={15} /> Open Preview
                  </a>
                )}
              </div>
            </div>

            {/* Bottom Security Guarantee */}
            <div
              style={{
                marginTop: '24px',
                paddingTop: '16px',
                borderTop: '1px solid #DEDACD',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '20px',
                fontSize: '12px',
                color: '#5C5A52',
                flexWrap: 'wrap',
              }}
            >
              <span>🛡️ End-to-end encrypted transfer</span>
              <span>⚡ High-speed CDN mirror</span>
              <span>{user ? `👤 Logged in as ${user.name}` : '🔒 Zero-login preview'}</span>
            </div>
          </div>
        )}
      </main>

      {/* Authentication Prompt Modal for Edit */}
      {showAuthModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(43,42,38,0.5)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setShowAuthModal(false)}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #DEDACD',
              padding: '28px',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: '#DCE8DF',
                    color: '#2F4E3B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="lock" size={16} />
                </div>
                <h3 style={{ fontFamily: "Georgia, serif", fontSize: '18px', fontWeight: 600, color: '#2B2A26', margin: 0 }}>
                  Sign In to Edit
                </h3>
              </div>
              <button
                onClick={() => setShowAuthModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5C5A52' }}
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#5C5A52', lineHeight: 1.5, marginBottom: '20px' }}>
              This link permits editing. Please sign in to your FileSphere account so modifications can be attributed to your identity.
            </p>

            {authError && (
              <div
                style={{
                  backgroundColor: '#FBEAE6',
                  color: '#A23B2E',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  marginBottom: '14px',
                  border: '1px solid rgba(162, 59, 46, 0.2)',
                }}
              >
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#2B2A26', display: 'block', marginBottom: '4px' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #DEDACD',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#2B2A26', display: 'block', marginBottom: '4px' }}>
                  Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #DEDACD',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowAuthModal(false)}
                  style={{
                    flex: 1,
                    padding: '11px',
                    borderRadius: '8px',
                    backgroundColor: '#ECE7DC',
                    border: '1px solid #DEDACD',
                    color: '#2B2A26',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={authSubmitting}
                  style={{
                    flex: 1,
                    padding: '11px',
                    borderRadius: '8px',
                    backgroundColor: '#3F6B4F',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: authSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {authSubmitting ? 'Signing in...' : 'Sign In & Edit'}
                </button>
              </div>

              <div style={{ textAlign: 'center', marginTop: '10px' }}>
                <Link
                  to={`/signup?redirect=${encodeURIComponent(window.location.pathname)}`}
                  style={{ fontSize: '12px', color: '#3F6B4F', textDecoration: 'none', fontWeight: 600 }}
                >
                  Don't have an account? Sign up
                </Link>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Shared Item Modal (Authenticated) */}
      {showEditModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(43,42,38,0.5)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setShowEditModal(false)}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #DEDACD',
              padding: '28px',
              maxWidth: '560px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: '#DCE8DF',
                    color: '#2F4E3B',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="edit" size={16} />
                </div>
                <h3 style={{ fontFamily: "Georgia, serif", fontSize: '18px', fontWeight: 600, color: '#2B2A26', margin: 0 }}>
                  Edit Shared {isFolder ? 'Folder' : 'File'}
                </h3>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5C5A52' }}
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            {editError && (
              <div
                style={{
                  backgroundColor: '#FBEAE6',
                  color: '#A23B2E',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  marginBottom: '14px',
                  border: '1px solid rgba(162, 59, 46, 0.2)',
                }}
              >
                {editError}
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#2B2A26', display: 'block', marginBottom: '6px' }}>
                  {isFolder ? 'Folder Name' : 'File Name'}
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #DEDACD',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Text content editor if it's a text file */}
              {!isFolder && getFileCategory(data.item.mimeType) === 'text' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#2B2A26' }}>
                      Document Content
                    </label>
                    {editContentLoading && (
                      <span style={{ fontSize: '11px', color: '#5C5A52' }}>Loading content...</span>
                    )}
                  </div>
                  <textarea
                    rows={10}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    disabled={editContentLoading}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #DEDACD',
                      fontSize: '13px',
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      boxSizing: 'border-box',
                      outline: 'none',
                      resize: 'vertical',
                    }}
                  />
                </div>
              )}

              <div
                style={{
                  backgroundColor: '#F4F1EA',
                  padding: '12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#5C5A52',
                  lineHeight: 1.5,
                }}
              >
                💡 Editing as <b style={{ color: '#2B2A26' }}>{user?.name}</b> ({user?.email}). Changes are committed to the file system immediately.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: '8px',
                  backgroundColor: '#ECE7DC',
                  border: '1px solid #DEDACD',
                  color: '#2B2A26',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={editSaving}
                style={{
                  flex: 1,
                  padding: '11px',
                  borderRadius: '8px',
                  backgroundColor: '#3F6B4F',
                  border: 'none',
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: editSaving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <Icon name="check" size={15} />
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subfile Preview Lightbox Modal */}
      {previewSubfile && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(43,42,38,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setPreviewSubfile(null)}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #DEDACD',
              padding: '24px',
              maxWidth: '680px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📄</span>
                <h3
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#2B2A26',
                    margin: 0,
                    maxWidth: '440px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {previewSubfile.name}
                </h3>
              </div>
              <button
                onClick={() => setPreviewSubfile(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5C5A52' }}
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: '260px',
                backgroundColor: '#F4F1EA',
                borderRadius: '10px',
                border: '1px solid #DEDACD',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                padding: '16px',
              }}
            >
              {getFileCategory(previewSubfile.mimeType) === 'image' ? (
                <img
                  src={getSubfileUrl(previewSubfile.id, true)}
                  alt={previewSubfile.name}
                  style={{ maxHeight: '400px', maxWidth: '100%', objectFit: 'contain', borderRadius: '6px' }}
                />
              ) : getFileCategory(previewSubfile.mimeType) === 'video' ? (
                <video
                  controls
                  src={getSubfileUrl(previewSubfile.id, true)}
                  style={{ maxHeight: '400px', maxWidth: '100%', borderRadius: '6px' }}
                />
              ) : getFileCategory(previewSubfile.mimeType) === 'audio' ? (
                <audio controls src={getSubfileUrl(previewSubfile.id, true)} style={{ width: '100%', maxWidth: '380px' }} />
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '42px', marginBottom: '8px' }}>📄</div>
                  <div style={{ fontWeight: 600, color: '#2B2A26', marginBottom: '4px' }}>{previewSubfile.name}</div>
                  <div style={{ fontSize: '12px', color: '#5C5A52', marginBottom: '14px' }}>
                    {formatBytes(previewSubfile.size)} • {previewSubfile.mimeType || 'Document'}
                  </div>
                  <a
                    href={getSubfileUrl(previewSubfile.id, true)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: '6px',
                      backgroundColor: '#3F6B4F',
                      color: '#FFFFFF',
                      textDecoration: 'none',
                      fontSize: '12px',
                      fontWeight: 600,
                    }}
                  >
                    <Icon name="eye" size={13} /> Open in New Tab
                  </a>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
              {allowsDownload && (
                <a
                  href={getSubfileUrl(previewSubfile.id, false)}
                  download
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    backgroundColor: '#3F6B4F',
                    color: '#FFFFFF',
                    textDecoration: 'none',
                    fontSize: '12px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Icon name="download" size={14} /> Download File
                </a>
              )}
              <button
                onClick={() => setPreviewSubfile(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  backgroundColor: '#ECE7DC',
                  border: '1px solid #DEDACD',
                  color: '#2B2A26',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Subfolder Modal in Public Folder */}
      {showNewFolderModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(43,42,38,0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              border: '1px solid #DEDACD',
              padding: '24px',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 600, color: '#2B2A26' }}>
              Create New Subfolder
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#5C5A52' }}>
              Add a new subfolder to <b>{data?.item?.name}</b>
            </p>
            <form onSubmit={handlePublicCreateFolder}>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #DEDACD',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  marginBottom: '16px',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewFolderModal(false);
                    setNewFolderName('');
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #DEDACD',
                    backgroundColor: '#F4F1EA',
                    color: '#2B2A26',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingFolder || !newFolderName.trim()}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#3F6B4F',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: creatingFolder || !newFolderName.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {creatingFolder ? 'Creating...' : 'Create Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ask for Edit Access Modal */}
      {showRequestAccessModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(43,42,38,0.45)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '16px',
          }}
        >
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              border: '1px solid #DEDACD',
              padding: '24px',
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>🔐</span>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600, color: '#2B2A26' }}>
                  Ask for Edit Access
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRequestAccessModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#5C5A52' }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#5C5A52', lineHeight: 1.5 }}>
              This item is currently view-only. You can send a request to the owner (<b>{data?.item?.owner || 'File Owner'}</b>) to grant you edit permissions.
            </p>

            <form onSubmit={handleSubmitRequestAccess}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#2B2A26', marginBottom: '6px' }}>
                  Your Email Address:
                </label>
                <input
                  type="email"
                  required
                  placeholder="yourname@example.com"
                  value={user?.email || requestEmail}
                  readOnly={Boolean(user?.email)}
                  onChange={(e) => setRequestEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #DEDACD',
                    backgroundColor: user?.email ? '#FBF9F5' : '#FFFFFF',
                    color: '#2B2A26',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                {user?.email && (
                  <div style={{ fontSize: '11px', color: '#3F6B4F', marginTop: '4px' }}>
                    Signed in as {user.email}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#2B2A26', marginBottom: '6px' }}>
                  Message to owner (optional):
                </label>
                <textarea
                  placeholder="Hi, I'd like to collaborate and make some edits to this..."
                  rows={3}
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #DEDACD',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                  }}
                />
              </div>

              {requestError && (
                <div style={{ padding: '8px 12px', borderRadius: '6px', background: '#FBEAE6', color: '#A23B2E', fontSize: '12px', marginBottom: '14px', fontWeight: 500 }}>
                  {requestError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowRequestAccessModal(false)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '8px',
                    border: '1px solid #DEDACD',
                    backgroundColor: '#F4F1EA',
                    color: '#2B2A26',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={requestSending}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#3F6B4F',
                    color: '#FFFFFF',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: requestSending ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 6px rgba(63, 107, 79, 0.25)',
                  }}
                >
                  {requestSending ? 'Sending Request...' : 'Send Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer
        style={{
          padding: '18px',
          textAlign: 'center',
          fontSize: '12px',
          color: '#5C5A52',
          borderTop: '1px solid #DEDACD',
          backgroundColor: '#FFFFFF',
        }}
      >
        FileSphere Distributed Storage Architecture • Secure Public File Sharing
      </footer>

      <style>{`
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
