import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import Icon from '../components/Icon';

export default function MockGoogleLogin() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const mockUsers = [
    { name: 'Alex River', email: 'alex.river@gmail.com' },
    { name: 'Jane Smith', email: 'jane.smith@gmail.com' },
  ];

  async function handleMockLogin(mockEmail, mockName) {
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/google/mock-callback', {
        email: mockEmail,
        name: mockName,
      });

      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setUser(res.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleCustomSubmit(e) {
    e.preventDefault();
    if (!email || !name) {
      setError('Please provide both name and email.');
      return;
    }
    handleMockLogin(email, name);
  }

  return (
    <div className="auth-page mock-oauth-page" style={{ background: '#F8F9FA' }}>
      <div className="auth-card" style={{ maxWidth: '420px', padding: '40px', border: '1px solid #DADCE0', boxShadow: 'none' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          {/* Custom Google logo style */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', fontSize: '24px', fontWeight: 'bold', fontFamily: 'Product Sans, Arial, sans-serif' }}>
            <span style={{ color: '#4285F4' }}>G</span>
            <span style={{ color: '#EA4335' }}>o</span>
            <span style={{ color: '#FBBC05' }}>o</span>
            <span style={{ color: '#4285F4' }}>g</span>
            <span style={{ color: '#34A853' }}>l</span>
            <span style={{ color: '#EA4335' }}>e</span>
          </div>
          <h1 style={{ fontSize: '1.4rem', marginTop: '16px', fontWeight: '500' }}>Sign in</h1>
          <p style={{ color: '#5F6368', fontSize: '0.9rem', marginTop: '6px' }}>to continue to FileSphere</p>
        </div>

        {error && (
          <div className="banner banner-error" style={{ marginBottom: '16px' }}>
            <Icon name="alert" size={16} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#5F6368' }}>Choose a mock account:</span>
          {mockUsers.map((u) => (
            <button
              key={u.email}
              type="button"
              className="btn btn-ghost"
              onClick={() => handleMockLogin(u.email, u.name)}
              disabled={loading}
              style={{
                justifyContent: 'flex-start',
                padding: '12px 16px',
                textAlign: 'left',
                border: '1px solid #DADCE0',
                borderRadius: '8px',
                background: '#fff',
                fontSize: '0.9rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#E8F0FE', color: '#1A73E8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.8rem' }}>
                  {u.name.substring(0, 1)}
                </div>
                <div>
                  <div style={{ fontWeight: '500', color: '#3C4043' }}>{u.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#70757A' }}>{u.email}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="divider-row" style={{ color: '#70757A', margin: '16px 0' }}>or use a custom profile</div>

        <form onSubmit={handleCustomSubmit}>
          <div className="field">
            <label htmlFor="mockName" style={{ textTransform: 'none', color: '#3C4043', fontSize: '0.85rem' }}>Name</label>
            <div className="input-wrap">
              <Icon name="user" style={{ color: '#70757A' }} />
              <input
                id="mockName"
                type="text"
                placeholder="Google User"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                style={{ border: '1px solid #DADCE0', padding: '10px 12px 10px 40px', borderRadius: '8px' }}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="mockEmail" style={{ textTransform: 'none', color: '#3C4043', fontSize: '0.85rem' }}>Email address</label>
            <div className="input-wrap">
              <Icon name="mail" style={{ color: '#70757A' }} />
              <input
                id="mockEmail"
                type="email"
                placeholder="user@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                style={{ border: '1px solid #DADCE0', padding: '10px 12px 10px 40px', borderRadius: '8px' }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ background: '#1A73E8', borderRadius: '8px', color: '#fff', padding: '12px' }}
          >
            {loading ? 'Connecting...' : 'Continue'}
          </button>
        </form>
      </div>

      <div style={{ marginTop: '24px', fontSize: '0.75rem', color: '#70757A', display: 'flex', gap: '16px' }}>
        <span>English (United States)</span>
        <a href="#" style={{ color: '#70757A' }}>Help</a>
        <a href="#" style={{ color: '#70757A' }}>Privacy</a>
        <a href="#" style={{ color: '#70757A' }}>Terms</a>
      </div>
    </div>
  );
}
