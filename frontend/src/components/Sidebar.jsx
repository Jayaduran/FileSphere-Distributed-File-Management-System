import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { useAuth } from '../context/useAuth';
import { useFiles } from '../context/useFiles';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const navItems = [
  { to: '/dashboard', label: 'Files', icon: 'folder' },
  { to: '/recent', label: 'Recent', icon: 'clock' },
  { to: '/starred', label: 'Starred', icon: 'star' },
  { to: '/shared-with-me', label: 'Shared with me', icon: 'share' },
  { to: '/shared-by-me', label: 'Shared by me', icon: 'link' },
  { to: '/trash', label: 'Trash', icon: 'trash' },
];

export default function Sidebar({ onUploadClick, onFolderUploadClick, onNewFolderClick }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { storage } = useFiles();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  function handleSignOut() {
    logout();
    navigate('/login');
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <div className="brand-mark brand-mark-sm">
            <Icon name="folder" size={18} />
          </div>
          <div>
            <div className="brand-name-sm">FileSphere</div>
            <div className="brand-sub">Cloud storage</div>
          </div>
        </div>

        {/* Single Unified Upload & New Button */}
        <div className="upload-btn-container" ref={dropdownRef} style={{ position: 'relative', margin: '16px 0' }}>
          <button
            className="btn btn-primary upload-btn"
            onClick={() => setDropdownOpen(prev => !prev)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(63, 107, 79, 0.22)',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            <Icon name="plus" size={18} strokeWidth={2.4} />
            <span>New</span>
            <Icon name={dropdownOpen ? 'chevron-up' : 'chevron-down'} size={14} style={{ marginLeft: 'auto', opacity: 0.8 }} />
          </button>

          {dropdownOpen && (
            <div
              className="upload-dropdown-menu"
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                right: 0,
                background: '#FFFFFF',
                borderRadius: '10px',
                border: '1px solid #DEDACD',
                boxShadow: '0 12px 30px rgba(43, 42, 38, 0.12), 0 4px 8px rgba(43, 42, 38, 0.04)',
                padding: '6px',
                zIndex: 100,
                animation: 'dropdownFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              <button
                type="button"
                className="upload-menu-item"
                onClick={() => {
                  setDropdownOpen(false);
                  onUploadClick && onUploadClick();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '9px 12px',
                  border: 'none',
                  background: 'transparent',
                  borderRadius: '6px',
                  fontSize: '13.5px',
                  fontWeight: 500,
                  color: '#2B2A26',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.12s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F4F1EA'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: '24px', display: 'flex', justifyContent: 'center', color: '#3F6B4F' }}>
                  <Icon name="file" size={16} />
                </div>
                <span>Upload file</span>
              </button>

              <button
                type="button"
                className="upload-menu-item"
                onClick={() => {
                  setDropdownOpen(false);
                  onFolderUploadClick && onFolderUploadClick();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '9px 12px',
                  border: 'none',
                  background: 'transparent',
                  borderRadius: '6px',
                  fontSize: '13.5px',
                  fontWeight: 500,
                  color: '#2B2A26',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.12s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F4F1EA'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: '24px', display: 'flex', justifyContent: 'center', color: '#3F6B4F' }}>
                  <Icon name="folder" size={16} />
                </div>
                <span>Upload folder</span>
              </button>

              <div style={{ height: '1px', background: '#EDE9DE', margin: '4px 6px' }} />

              <button
                type="button"
                className="upload-menu-item"
                onClick={() => {
                  setDropdownOpen(false);
                  onNewFolderClick && onNewFolderClick();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '9px 12px',
                  border: 'none',
                  background: 'transparent',
                  borderRadius: '6px',
                  fontSize: '13.5px',
                  fontWeight: 500,
                  color: '#2B2A26',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.12s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F4F1EA'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: '24px', display: 'flex', justifyContent: 'center', color: '#3F6B4F' }}>
                  <Icon name="folderPlus" size={16} />
                </div>
                <span>New folder</span>
              </button>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="sidebar-bottom">
        <div className="sidebar-storage" style={{ margin: '0 16px 16px', padding: '12px', background: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>Storage</span>
            <span style={{ fontSize: '11px', color: '#6B7280' }}>
              {storage && storage.limitBytes ? Math.round((storage.usedBytes / storage.limitBytes) * 100) : 0}% used
            </span>
          </div>
          <div className="progress-track" style={{ height: '4px', marginBottom: '8px' }}>
            <div className="progress-fill" style={{ width: `${storage && storage.limitBytes ? Math.round((storage.usedBytes / storage.limitBytes) * 100) : 0}%` }} />
          </div>
          <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '8px' }}>
            {storage ? formatBytes(storage.usedBytes) : '0 B'} of 10.0 GB
          </div>
          <button className="btn btn-ghost btn-sm" style={{ width: '100%', padding: '6px', fontSize: '12px', color: '#2563EB', background: '#EFF6FF' }}>
            Upgrade plan
          </button>
        </div>
        <NavLink to="/help" className="sidebar-link">
          <Icon name="help" size={18} />
          Help
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <Icon name="settings" size={18} />
          Settings
        </NavLink>
        <button className="sidebar-link sidebar-link-btn" onClick={handleSignOut}>
          <Icon name="signOut" size={18} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
