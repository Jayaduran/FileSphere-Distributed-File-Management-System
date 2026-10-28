import { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import { useAuth } from '../context/useAuth';
import { Link, useLocation } from 'react-router-dom';
import api from '../services/api';

export default function Topbar({ searchPlaceholder = 'Search…', breadcrumb, onSearch, onAdvancedFilterChange }) {
  const { user } = useAuth();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showFilterPopover, setShowFilterPopover] = useState(false);
  const [sharedFiles, setSharedFiles] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Advanced Filter state
  const [filterType, setFilterType] = useState('all');
  const [filterOwner, setFilterOwner] = useState('anyone');
  const [filterDate, setFilterDate] = useState('anytime');
  const [filterLocation, setFilterLocation] = useState('anywhere');
  const [filterStarredOnly, setFilterStarredOnly] = useState(false);
  const [filterSharedOnly, setFilterSharedOnly] = useState(false);

  const notificationRef = useRef(null);
  const filterRef = useRef(null);
  const onSearchRef = useRef(onSearch);

  const isFilterActive = filterType !== 'all' || filterOwner !== 'anyone' || filterDate !== 'anytime' || filterLocation !== 'anywhere' || filterStarredOnly || filterSharedOnly;

  const handleApplyFilter = (override) => {
    const filters = override || {
      type: filterType,
      owner: filterOwner,
      date: filterDate,
      location: filterLocation,
      starred: filterStarredOnly,
      shared: filterSharedOnly,
    };
    if (onAdvancedFilterChange) {
      onAdvancedFilterChange(filters);
    }
  };

  const handleResetFilter = () => {
    setFilterType('all');
    setFilterOwner('anyone');
    setFilterDate('anytime');
    setFilterLocation('anywhere');
    setFilterStarredOnly(false);
    setFilterSharedOnly(false);
    handleApplyFilter({
      type: 'all',
      owner: 'anyone',
      date: 'anytime',
      location: 'anywhere',
      starred: false,
      shared: false,
    });
  };

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
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setShowFilterPopover(false);
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
      <div className="search-and-filter-container" style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative', flex: 1, maxWidth: '640px' }} ref={filterRef}>
        <div className="topbar-search input-wrap" style={{ flex: 1, margin: 0, position: 'relative' }}>
          <Icon name="search" />
          <input 
            type="text" 
            placeholder={searchPlaceholder} 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#8C897E',
                display: 'flex',
                padding: '2px'
              }}
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </div>

        {/* Google Drive-style Advanced Filter button */}
        <button
          type="button"
          onClick={() => setShowFilterPopover(prev => !prev)}
          className={`icon-btn ${isFilterActive ? 'filter-active' : ''}`}
          title="Search options & filters"
          style={{
            position: 'relative',
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            border: isFilterActive ? '1px solid #3F6B4F' : '1px solid #DEDACD',
            background: isFilterActive ? '#EBF2ED' : '#FFFFFF',
            color: isFilterActive ? '#3F6B4F' : '#5C5A52',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease'
          }}
        >
          <Icon name="sliders" size={17} />
          {isFilterActive && (
            <span
              style={{
                position: 'absolute',
                top: '6px',
                right: '6px',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#3F6B4F',
              }}
            />
          )}
        </button>

        {/* Google Drive-Style Advanced Filter Popover */}
        {showFilterPopover && (
          <div className="adv-filter-popover">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #EDE9DE', paddingBottom: '10px' }}>
              <div style={{ fontWeight: 600, fontSize: '15px', color: '#2B2A26', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon name="sliders" size={16} />
                <span>Search filters</span>
              </div>
              {isFilterActive && (
                <button
                  type="button"
                  onClick={handleResetFilter}
                  style={{ background: 'transparent', border: 'none', color: '#8C897E', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Reset all
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Type filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#5C5A52' }}>Type</label>
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #DEDACD', background: '#FBF9F5', fontSize: '13px', color: '#2B2A26', outline: 'none' }}
                >
                  <option value="all">Any type</option>
                  <option value="folders">Folders</option>
                  <option value="documents">Documents (PDF, Word, Text)</option>
                  <option value="images">Images</option>
                  <option value="videos">Videos & Audio</option>
                </select>
              </div>

              {/* Owner filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#5C5A52' }}>Owner</label>
                <select
                  value={filterOwner}
                  onChange={e => setFilterOwner(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #DEDACD', background: '#FBF9F5', fontSize: '13px', color: '#2B2A26', outline: 'none' }}
                >
                  <option value="anyone">Anyone</option>
                  <option value="me">Owned by me</option>
                  <option value="not-me">Not owned by me (Shared)</option>
                </select>
              </div>

              {/* Date Modified filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#5C5A52' }}>Date modified</label>
                <select
                  value={filterDate}
                  onChange={e => setFilterDate(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #DEDACD', background: '#FBF9F5', fontSize: '13px', color: '#2B2A26', outline: 'none' }}
                >
                  <option value="anytime">Any time</option>
                  <option value="today">Today</option>
                  <option value="last7">Last 7 days</option>
                  <option value="last30">Last 30 days</option>
                  <option value="thisYear">This year</option>
                </select>
              </div>

              {/* Location filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#5C5A52' }}>Location</label>
                <select
                  value={filterLocation}
                  onChange={e => setFilterLocation(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #DEDACD', background: '#FBF9F5', fontSize: '13px', color: '#2B2A26', outline: 'none' }}
                >
                  <option value="anywhere">Anywhere</option>
                  <option value="drive">My Files</option>
                  <option value="starred">Starred</option>
                  <option value="trash">Trash</option>
                </select>
              </div>

              {/* Checkboxes */}
              <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#2B2A26', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={filterStarredOnly}
                    onChange={e => setFilterStarredOnly(e.target.checked)}
                  />
                  <span>Starred items</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#2B2A26', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={filterSharedOnly}
                    onChange={e => setFilterSharedOnly(e.target.checked)}
                  />
                  <span>Public links</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px', borderTop: '1px solid #EDE9DE', paddingTop: '12px' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={handleResetFilter}
                  style={{ fontSize: '12px' }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    handleApplyFilter();
                    setShowFilterPopover(false);
                  }}
                  style={{ fontSize: '12px', width: 'auto' }}
                >
                  Apply filter
                </button>
              </div>
            </div>
          </div>
        )}
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
