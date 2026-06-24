import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import api from '../services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      setMessage(res.data.message || 'A password reset link has been sent to your email.');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to request password reset.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="brand-mark">
          <Icon name="cloud" size={26} />
        </div>
        <h1 className="brand-name">FileSphere</h1>
        <p className="brand-tagline">Grounded, secure storage for your digital world.</p>
      </div>

      <div className="auth-card">
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px', color: '#111827' }}>Forgot Password?</h2>
        <p style={{ fontSize: '0.875rem', color: '#6B7280', marginBottom: '20px', lineHeight: '1.5' }}>
          Enter the email address associated with your account, and we will email you a secure link to reset your password.
        </p>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="banner banner-error" style={{ marginBottom: '16px' }}>
              <Icon name="alert" size={16} />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div className="banner banner-success" style={{ marginBottom: '16px', background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', padding: '10px 14px', borderRadius: '6px', display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.85rem' }}>
              <Icon name="check" size={16} />
              <span>{message}</span>
            </div>
          )}

          <div className="field">
            <label htmlFor="email">Email address</label>
            <div className="input-wrap">
              <Icon name="mail" />
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '8px' }}>
            {loading ? 'Sending link…' : 'Send reset link'}
            {!loading && <Icon name="arrowRight" size={18} />}
          </button>

          <div className="auth-switch" style={{ marginTop: '20px' }}>
            Remembered your password? <Link to="/login">Sign in</Link>
          </div>
        </form>
      </div>

      <div className="auth-footer">
        <span className="tls-pill">
          <span className="dot" /> Secure connection
        </span>
        <div className="footer-links">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms of Service</Link>
        </div>
      </div>
    </div>
  );
}
