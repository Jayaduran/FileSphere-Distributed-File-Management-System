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
  { to: '/shared', label: 'Shared', icon: 'share' },
  { to: '/trash', label: 'Trash', icon: 'trash' },
];

export default function Sidebar({ onUploadClick, onFolderUploadClick }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { storage } = useFiles();

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

        <button className="btn btn-primary upload-btn" onClick={onUploadClick}>
          <Icon name="upload" size={18} />
          Upload file
        </button>
        {onFolderUploadClick && (
          <button className="btn btn-ghost upload-btn" onClick={onFolderUploadClick} style={{ marginTop: '-10px' }}>
            <Icon name="folder" size={18} />
            Upload folder
          </button>
        )}

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
