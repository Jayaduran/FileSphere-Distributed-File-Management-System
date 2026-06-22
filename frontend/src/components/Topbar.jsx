import { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import { useAuth } from '../context/useAuth';
import { Link } from 'react-router-dom';

export default function Topbar({ searchPlaceholder = 'Search…', breadcrumb, onSearch }) {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const onSearchRef = useRef(onSearch);

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  const initial = (user?.name || user?.fullName)?.trim()?.[0]?.toUpperCase();

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
        <button className="icon-btn" aria-label="Storage">
          <Icon name="cloud" size={20} />
        </button>
        <Link to="/settings" className="avatar" aria-label="Account settings" title="Account settings" style={{ textDecoration: 'none' }}>
          {initial ? initial : <Icon name="user" size={18} />}
        </Link>
      </div>

      {breadcrumb && <div className="breadcrumb">{breadcrumb}</div>}
    </header>
  );
}
