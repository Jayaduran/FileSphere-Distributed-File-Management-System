import { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import { useAuth } from '../context/useAuth';
import { Link, useLocation } from 'react-router-dom';
import api from '../services/api';

export default function Topbar({ searchPlaceholder = 'Search…', breadcrumb, onSearch }) {
  const { user } = useAuth();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [sharedFiles, setSharedFiles] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationRef = useRef(null);
  const onSearchRef = useRef(onSearch);

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  const initial = (user?.name || user?.fullName)?.trim()?.[0]?.toUpperCase();

  // Fetch shared notifications
  useEffect(() => {
    let isMounted = true;
    const fetchNotifications = async () => {
      try {
        const res = await api.get('/shared');
        if (isMounted) {
          const filesList = res.data?.files || [];
          setSharedFiles(filesList);

          // Calculate unread count against localStorage seen list
          const seenIds = new Set(JSON.parse(localStorage.getItem('filesphere_seen_shared_ids') || '[]'));
          const unread = filesList.filter(f => !seenIds.has(f.id)).length;
          setUnreadCount(unread);
        }
      } catch (e) {
        // Silently catch
      }
    };
    fetchNotifications();
    return () => { isMounted = false; };
  }, []);

  // If user is currently on /shared page, mark all as seen
  useEffect(() => {
    if (location.pathname === '/shared' && sharedFiles.length > 0) {
      const currentIds = sharedFiles.map(f => f.id);
      localStorage.setItem('filesphere_seen_shared_ids', JSON.stringify(currentIds));
      setUnreadCount(0);
    }
  }, [location.pathname, sharedFiles]);

  const handleToggleNotifications = () => {
    const nextState = !showNotifications;
    setShowNotifications(nextState);
    if (nextState) {
      // Mark as seen when notification panel is opened
      const currentIds = sharedFiles.map(f => f.id);
      localStorage.setItem('filesphere_seen_shared_ids', JSON.stringify(currentIds));
      setUnreadCount(0);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (onSearchRef.current) onSearchRef.current(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  return (
    <header className="topbar">
      <div className="topbar-search input-wrap">
        <Icon name="search" />
        <input 
          type="text" 
          placeholder={searchPlaceholder} 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="topbar-actions">
        <div className="notification-wrapper" ref={notificationRef} style={{ position: 'relative' }}>
          <button 
            className="icon-btn" 
            aria-label="Shared notifications" 
            title="Shared files notifications"
            onClick={handleToggleNotifications}
            style={{ position: 'relative' }}
          >
            <Icon name="bell" size={20} />
            {unreadCount > 0 && (
              <span 
                style={{
                  position: 'absolute',
                  top: '2px',
                  right: '2px',
                  background: '#EF4444',
                  color: '#fff',
                  fontSize: '10px',
                  fontWeight: 700,
                  borderRadius: '10px',
                  minWidth: '16px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3px',
                  lineHeight: 1,
                  boxShadow: '0 0 0 2px #fff'
                }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div 
              className="notification-dropdown"
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '320px',
                background: '#fff',
                borderRadius: '12px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                border: '1px solid #E5E7EB',
                zIndex: 1000,
                overflow: 'hidden'
              }}
            >
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '14px', color: '#111827' }}>Shared with you</span>
                <span style={{ fontSize: '12px', color: '#6B7280' }}>{sharedFiles.length} item{sharedFiles.length !== 1 ? 's' : ''}</span>
              </div>

              <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                {sharedFiles.length === 0 ? (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: '#6B7280', fontSize: '13px' }}>
                    <Icon name="inbox" size={24} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                    <p>No shared files yet</p>
                  </div>
                ) : (
                  sharedFiles.slice(0, 5).map(item => (
                    <Link
                      key={item.id}
                      to="/shared"
                      onClick={() => setShowNotifications(false)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 16px',
                        borderBottom: '1px solid #F9FAFB',
                        textDecoration: 'none',
                        color: 'inherit',
                        transition: 'background 120ms ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#EEF2FF', color: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name={item.type === 'folder' ? 'folder' : 'file'} size={16} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#6B7280', display: 'flex', gap: '4px' }}>
                          <span>Shared by {item.sharedBy || 'Someone'}</span>
                          {item.permission && <span>• {item.permission}</span>}
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>

              {sharedFiles.length > 0 && (
                <Link
                  to="/shared"
                  onClick={() => setShowNotifications(false)}
                  style={{
                    display: 'block',
                    padding: '10px 16px',
                    textAlign: 'center',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#4F46E5',
                    background: '#F9FAFB',
                    textDecoration: 'none',
                    borderTop: '1px solid #F3F4F6'
                  }}
                >
                  View all in Shared Files →
                </Link>
              )}
            </div>
          )}
        </div>

        <Link to="/settings" className="avatar" aria-label="Account settings" title="Account settings" style={{ textDecoration: 'none' }}>
          {initial ? initial : <Icon name="user" size={18} />}
        </Link>
      </div>

      {breadcrumb && <div className="breadcrumb">{breadcrumb}</div>}
    </header>
  );
}
