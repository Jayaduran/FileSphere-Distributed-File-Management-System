import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import api from '../services/api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!token) {
      setError('Password reset token is missing. Please request a new link.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/reset-password', { token, newPassword: password });
      setMessage(res.data.message || 'Your password has been reset successfully.');
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to reset password.');
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
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '8px', color: '#111827' }}>Reset Password</h2>
        <p style={{ fontSize: '0.875rem', color: '#6B7280', marginBottom: '20px', lineHeight: '1.5' }}>
          Please choose a strong new password to secure your account.
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
              <span>{message} Redirecting to login...</span>
            </div>
          )}

          <div className="field">
            <label htmlFor="password">New Password</label>
            <div className="input-wrap">
              <Icon name="lock" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="At least 6 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="toggle-visibility"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
          </div>

          <div className="field" style={{ marginTop: '16px' }}>
            <label htmlFor="confirmPassword">Confirm New Password</label>
            <div className="input-wrap">
              <Icon name="lock" />
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: '24px' }}>
            {loading ? 'Resetting password…' : 'Reset password'}
            {!loading && <Icon name="check" size={18} />}
          </button>

          <div className="auth-switch" style={{ marginTop: '20px' }}>
            Nevermind? <Link to="/login">Cancel</Link>
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
