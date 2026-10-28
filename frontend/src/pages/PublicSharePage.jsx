import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
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
  const { token } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [manualToken, setManualToken] = useState('');

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('Please provide a share link or token to view.');
      return;
    }
    const cleanToken = cleanTokenString(token);
    setLoading(true);
    setError(null);

    // Fetch public metadata via unified api service with fallbacks
    const fetchItem = async () => {
      try {
        const res = await api.get(`/public/files/link/${encodeURIComponent(cleanToken)}/info`);
        setData(res.data);
      } catch (err1) {
        try {
          // Secondary fallback to /public/:token
          const res2 = await api.get(`/public/${encodeURIComponent(cleanToken)}/info`);
          setData(res2.data);
        } catch (err2) {
          console.error('Fetch public item error:', err2);
          const msg = err2.response?.data?.message || err1.response?.data?.message || 'Link is invalid or has expired';
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchItem();
  }, [token]);

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

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F4F1EA',
      color: '#2B2A26',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Top Navbar */}
      <header style={{
        padding: '16px 36px',
        borderBottom: '1px solid #DEDACD',
        backgroundColor: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 1px 3px rgba(43,42,38,0.03)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
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
          }}>
            FS
          </div>
          <div>
            <div style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontWeight: 700,
              fontSize: '20px',
              letterSpacing: '-0.2px',
              color: '#2B2A26',
              lineHeight: 1.1,
            }}>
              FileSphere
            </div>
            <div style={{ fontSize: '11px', color: '#5C5A52', marginTop: '2px', letterSpacing: '0.02em' }}>
              Distributed Cloud File System
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            to="/login"
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#2B2A26',
              textDecoration: 'none',
              border: '1px solid #DEDACD',
              backgroundColor: '#FFFFFF',
              transition: 'background 120ms ease',
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
              transition: 'background 120ms ease',
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
        padding: '40px 20px',
      }}>
        {/* Loading State */}
        {loading && (
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '22px',
            border: '1px solid #DEDACD',
            padding: '48px 40px',
            textAlign: 'center',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 1px 2px rgba(43,42,38,0.04), 0 8px 24px rgba(43,42,38,0.06)',
          }}>
            <div style={{
              width: '44px',
              height: '44px',
              border: '3px solid #DCE8DF',
              borderTopColor: '#3F6B4F',
              borderRadius: '50%',
              margin: '0 auto 20px',
              animation: 'spin 0.8s linear infinite',
            }} />
            <h3 style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: '20px',
              fontWeight: 600,
              color: '#2B2A26',
              marginBottom: '8px',
            }}>
              Retrieving Shared Content...
            </h3>
            <p style={{ fontSize: '13px', color: '#5C5A52' }}>
              Connecting to FileSphere storage node in fraction of a second.
            </p>
          </div>
        )}

        {/* Error / Invalid Link State */}
        {!loading && error && (
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '22px',
            border: '1px solid #DEDACD',
            padding: '44px 36px',
            textAlign: 'center',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 1px 2px rgba(43,42,38,0.04), 0 8px 24px rgba(43,42,38,0.06)',
          }}>
            <div style={{
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
            }}>
              <Icon name="x" size={24} />
            </div>
            <h2 style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: '22px',
              fontWeight: 700,
              color: '#2B2A26',
              marginBottom: '10px',
            }}>
              Link Invalid or Not Found
            </h2>
            <p style={{ fontSize: '14px', color: '#5C5A52', lineHeight: 1.6, marginBottom: '24px' }}>
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
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '22px',
            border: '1px solid #DEDACD',
            padding: '36px',
            maxWidth: '680px',
            width: '100%',
            boxShadow: '0 1px 2px rgba(43,42,38,0.04), 0 8px 24px rgba(43,42,38,0.06)',
          }}>
            {/* Header info badge */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '24px',
              paddingBottom: '16px',
              borderBottom: '1px solid #DEDACD',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
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
                }}>
                  <Icon name="globe" size={13} /> Public Share
                </span>
                <span style={{ fontSize: '13px', color: '#5C5A52' }}>
                  Shared by <b style={{ color: '#2B2A26' }}>{data.item.owner || 'FileSphere User'}</b>
                </span>
              </div>

              <div style={{ fontSize: '12px', color: '#5C5A52' }}>
                {new Date(data.item.createdAt).toLocaleDateString()}
              </div>
            </div>

            {/* Media / File Preview */}
            <div style={{
              backgroundColor: '#F4F1EA',
              borderRadius: '14px',
              border: '1px solid #DEDACD',
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
                  <audio
                    controls
                    src={getDownloadUrl(true)}
                    style={{ width: '100%', maxWidth: '400px' }}
                  />
                </div>
              ) : data.type === 'folder' ? (
                <div style={{ textAlign: 'center', padding: '16px 0', width: '100%' }}>
                  <div style={{
                    width: '68px',
                    height: '68px',
                    borderRadius: '16px',
                    backgroundColor: '#DCE8DF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2F4E3B',
                    margin: '0 auto 16px',
                    boxShadow: '0 2px 8px rgba(47, 78, 59, 0.15)',
                  }}>
                    <Icon name="folder" size={36} />
                  </div>
                  <h4 style={{
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    fontSize: '20px',
                    fontWeight: 600,
                    color: '#2B2A26',
                    marginBottom: '6px',
                  }}>
                    {data.item.name}
                  </h4>
                  <div style={{ fontSize: '13px', color: '#5C5A52' }}>
                    {data.item.files?.length || 0} files • {data.item.subfolders?.length || 0} subfolders
                  </div>

                  {data.item.files && data.item.files.length > 0 && (
                    <div style={{
                      marginTop: '16px',
                      maxHeight: '140px',
                      overflowY: 'auto',
                      textAlign: 'left',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #DEDACD',
                      borderRadius: '8px',
                      padding: '10px 14px',
                    }}>
                      {data.item.files.slice(0, 5).map((f) => (
                        <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', color: '#2B2A26' }}>
                          <span>📄 {f.name}</span>
                          <span style={{ color: '#5C5A52' }}>{formatBytes(f.size)}</span>
                        </div>
                      ))}
                      {data.item.files.length > 5 && (
                        <div style={{ fontSize: '11px', color: '#3F6B4F', fontWeight: 600, paddingTop: '6px' }}>
                          + {data.item.files.length - 5} more files inside zip
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{
                    width: '68px',
                    height: '68px',
                    borderRadius: '16px',
                    backgroundColor: '#DCE8DF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#3F6B4F',
                    margin: '0 auto 16px',
                    boxShadow: '0 2px 8px rgba(63, 107, 79, 0.15)',
                  }}>
                    <Icon name="file" size={34} />
                  </div>
                  <h4 style={{
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    fontSize: '20px',
                    fontWeight: 600,
                    color: '#2B2A26',
                    marginBottom: '6px',
                    wordBreak: 'break-all',
                    maxWidth: '460px',
                  }}>
                    {data.item.name}
                  </h4>
                  <div style={{ fontSize: '13px', color: '#5C5A52' }}>
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
                  padding: '15px',
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

                {data.type === 'file' && (
                  <a
                    href={getDownloadUrl(true)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '12px 18px',
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
                    <Icon name="eye" size={15} /> View Raw
                  </a>
                )}
              </div>
            </div>

            {/* Bottom Security Guarantee */}
            <div style={{
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid #DEDACD',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '20px',
              fontSize: '12px',
              color: '#5C5A52',
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
        padding: '18px',
        textAlign: 'center',
        fontSize: '12px',
        color: '#5C5A52',
        borderTop: '1px solid #DEDACD',
        backgroundColor: '#FFFFFF',
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
