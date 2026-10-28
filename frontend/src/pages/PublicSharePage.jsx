import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import Icon from '../components/Icon';

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
  if (mimeType.includes('text') || mimeType.includes('json') || mimeType.includes('javascript') || mimeType.includes('html')) return 'text';
  return 'other';
}

export default function PublicSharePage() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [manualToken, setManualToken] = useState('');

  useEffect(() => {
    if (!token) return;
    const cleanToken = token.trim();
    setLoading(true);
    setError(null);

    // Fetch public metadata
    axios.get(`${API_BASE_URL}/public/files/link/${encodeURIComponent(cleanToken)}/info`)
      .then((res) => {
        setData(res.data);
      })
      .catch((err) => {
        console.error('Fetch public item error:', err);
        const msg = err.response?.data?.message || 'Link is invalid or has expired';
        setError(msg);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    if (!token) return;
    setDownloading(true);
    const cleanToken = token.trim();
    const downloadEndpoint = `${API_BASE_URL}/public/files/link/${encodeURIComponent(cleanToken)}`;

    // Trigger direct download
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
    let target = manualToken.trim();
    // Support if user pasted a full URL
    if (target.includes('/share/')) {
      target = target.split('/share/').pop().split('?')[0].split('/')[0];
    } else if (target.includes('/link/')) {
      target = target.split('/link/').pop().split('?')[0].split('/')[0];
    }
    navigate(`/share/${encodeURIComponent(target)}`);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 50%, #0F172A 100%)',
      color: '#F8FAFC',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Top Navbar */}
      <header style={{
        padding: '16px 32px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
          }}>
            FS
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '18px', letterSpacing: '-0.3px', color: '#fff' }}>
              FileSphere
            </div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '-2px' }}>
              Distributed Cloud File System
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            to="/login"
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              color: '#E2E8F0',
              textDecoration: 'none',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              background: 'rgba(255, 255, 255, 0.05)',
              transition: 'all 0.2s ease',
            }}
          >
            Sign In
          </Link>
          <Link
            to="/signup"
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#fff',
              textDecoration: 'none',
              background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
              boxShadow: '0 2px 8px rgba(79, 70, 229, 0.35)',
              transition: 'all 0.2s ease',
            }}
          >
            Get Started Free
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
      }}>
        {/* Loading State */}
        {loading && (
          <div style={{
            background: 'rgba(30, 41, 59, 0.7)',
            backdropFilter: 'blur(16px)',
            borderRadius: '20px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '48px 40px',
            textAlign: 'center',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              border: '3px solid rgba(99, 102, 241, 0.2)',
              borderTopColor: '#6366F1',
              borderRadius: '50%',
              margin: '0 auto 20px',
              animation: 'spin 0.8s linear infinite',
            }} />
            <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#F1F5F9', marginBottom: '8px' }}>
              Retrieving Shared Content...
            </h3>
            <p style={{ fontSize: '13px', color: '#94A3B8' }}>
              Connecting to FileSphere storage node in fraction of a second.
            </p>
          </div>
        )}

        {/* Error / Wrong Link State */}
        {!loading && error && (
          <div style={{
            background: 'rgba(30, 41, 59, 0.85)',
            backdropFilter: 'blur(16px)',
            borderRadius: '20px',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            padding: '44px 36px',
            textAlign: 'center',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#EF4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              fontSize: '28px',
              border: '1px solid rgba(239, 68, 68, 0.3)',
            }}>
              ⚠️
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#F8FAFC', marginBottom: '10px' }}>
              Link Invalid or Not Found
            </h2>
            <p style={{ fontSize: '14px', color: '#94A3B8', lineHeight: 1.6, marginBottom: '24px' }}>
              {error.includes('trash')
                ? 'This shared item was moved to the trash by the owner.'
                : "The link you entered doesn't match any active public file or folder on FileSphere."}
            </p>

            <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
              <input
                type="text"
                placeholder="Enter share link or token..."
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  background: '#6366F1',
                  color: '#fff',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.2s',
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
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#E2E8F0',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: 500,
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                Go to FileSphere Home
              </Link>
            </div>
          </div>
        )}

        {/* Success Shared Item Display */}
        {!loading && data && data.item && (
          <div style={{
            background: 'rgba(30, 41, 59, 0.75)',
            backdropFilter: 'blur(20px)',
            borderRadius: '24px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            padding: '36px',
            maxWidth: '680px',
            width: '100%',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.6)',
          }}>
            {/* Header info badge */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '24px',
              paddingBottom: '16px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '20px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#34D399',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}>
                  <Icon name="globe" size={12} /> Public Share
                </span>
                <span style={{ fontSize: '13px', color: '#94A3B8' }}>
                  Shared by <b style={{ color: '#E2E8F0' }}>{data.item.owner || 'FileSphere User'}</b>
                </span>
              </div>

              <div style={{ fontSize: '12px', color: '#64748B' }}>
                {new Date(data.item.createdAt).toLocaleDateString()}
              </div>
            </div>

            {/* Media / File Preview */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.6)',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '28px',
              minHeight: '200px',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {data.type === 'file' && getFileCategory(data.item.mimeType) === 'image' ? (
                <div style={{ maxWidth: '100%', textAlign: 'center' }}>
                  <img
                    src={`${API_BASE_URL}/public/files/link/${encodeURIComponent(token.trim())}?view=1`}
                    alt={data.item.name}
                    style={{
                      maxHeight: '340px',
                      maxWidth: '100%',
                      borderRadius: '10px',
                      objectFit: 'contain',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    }}
                  />
                </div>
              ) : data.type === 'file' && getFileCategory(data.item.mimeType) === 'video' ? (
                <video
                  controls
                  src={`${API_BASE_URL}/public/files/link/${encodeURIComponent(token.trim())}?view=1`}
                  style={{
                    maxHeight: '340px',
                    maxWidth: '100%',
                    borderRadius: '10px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}
                />
              ) : data.type === 'file' && getFileCategory(data.item.mimeType) === 'audio' ? (
                <div style={{ width: '100%', padding: '20px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎵</div>
                  <audio
                    controls
                    src={`${API_BASE_URL}/public/files/link/${encodeURIComponent(token.trim())}?view=1`}
                    style={{ width: '100%', maxWidth: '400px' }}
                  />
                </div>
              ) : data.type === 'folder' ? (
                <div style={{ textAlign: 'center', padding: '16px 0', width: '100%' }}>
                  <div style={{
                    width: '72px',
                    height: '72px',
                    borderRadius: '18px',
                    background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    margin: '0 auto 16px',
                    boxShadow: '0 8px 20px rgba(245, 158, 11, 0.3)',
                  }}>
                    <Icon name="folder" size={36} />
                  </div>
                  <h4 style={{ fontSize: '18px', fontWeight: 600, color: '#F8FAFC', marginBottom: '6px' }}>
                    {data.item.name}
                  </h4>
                  <div style={{ fontSize: '13px', color: '#94A3B8' }}>
                    {data.item.files?.length || 0} files • {data.item.subfolders?.length || 0} subfolders
                  </div>

                  {data.item.files && data.item.files.length > 0 && (
                    <div style={{
                      marginTop: '16px',
                      maxHeight: '140px',
                      overflowY: 'auto',
                      textAlign: 'left',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                    }}>
                      {data.item.files.slice(0, 5).map((f) => (
                        <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', color: '#CBD5E1' }}>
                          <span>📄 {f.name}</span>
                          <span style={{ color: '#94A3B8' }}>{formatBytes(f.size)}</span>
                        </div>
                      ))}
                      {data.item.files.length > 5 && (
                        <div style={{ fontSize: '11px', color: '#818CF8', paddingTop: '4px' }}>
                          + {data.item.files.length - 5} more files inside zip
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{
                    width: '72px',
                    height: '72px',
                    borderRadius: '18px',
                    background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    margin: '0 auto 16px',
                    boxShadow: '0 8px 20px rgba(59, 130, 246, 0.3)',
                  }}>
                    <Icon name="file" size={36} />
                  </div>
                  <h4 style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    color: '#F8FAFC',
                    marginBottom: '6px',
                    wordBreak: 'break-all',
                    maxWidth: '460px',
                  }}>
                    {data.item.name}
                  </h4>
                  <div style={{ fontSize: '13px', color: '#94A3B8' }}>
                    {formatBytes(data.item.size)} • {data.item.mimeType || 'Binary file'}
                  </div>
                </div>
              )}
            </div>

            {/* Download and Share Action Bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={handleDownload}
                disabled={downloading}
                style={{
                  width: '100%',
                  padding: '16px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #4F46E5 0%, #6366F1 50%, #8B5CF6 100%)',
                  color: '#fff',
                  border: 'none',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: downloading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  boxShadow: '0 8px 24px rgba(79, 70, 229, 0.4)',
                  transition: 'all 0.2s ease',
                  opacity: downloading ? 0.8 : 1,
                }}
              >
                <Icon name="download" size={20} />
                {downloading
                  ? 'Starting High-Speed Download...'
                  : data.type === 'folder'
                  ? `Download Folder as ZIP (${formatBytes(data.item.size)})`
                  : `Download File (${formatBytes(data.item.size)})`}
              </button>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleCopyLink}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '12px',
                    background: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                    color: copied ? '#34D399' : '#E2E8F0',
                    border: '1px solid ' + (copied ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.12)'),
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Icon name={copied ? 'check' : 'copy'} size={16} />
                  {copied ? 'Share Link Copied!' : 'Copy Share Link'}
                </button>

                {data.type === 'file' && (
                  <a
                    href={`${API_BASE_URL}/public/files/link/${encodeURIComponent(token.trim())}?view=1`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '12px 18px',
                      borderRadius: '12px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: '#E2E8F0',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      fontSize: '14px',
                      fontWeight: 500,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    <Icon name="eye" size={16} /> View Raw
                  </a>
                )}
              </div>
            </div>

            {/* Bottom Security Guarantee */}
            <div style={{
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '20px',
              fontSize: '12px',
              color: '#64748B',
            }}>
              <span>🛡️ End-to-end encrypted transfer</span>
              <span>⚡ High-speed CDN mirror</span>
              <span>🔒 Zero-login required</span>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        padding: '16px',
        textAlign: 'center',
        fontSize: '12px',
        color: '#64748B',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
      }}>
        FileSphere Distributed Storage Architecture • Secure Public File Sharing
      </footer>

      <style>{`
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
