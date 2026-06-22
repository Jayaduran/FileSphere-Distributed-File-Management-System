import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import Icon from '../components/Icon';
import { useAuth } from '../context/useAuth';
import api from '../services/api';

// ── Passkey helpers ──────────────────────────────────────────────────────────

function base64urlToBuffer(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (padded.length % 4)) % 4;
  const b64 = padded + '='.repeat(pad);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buf) {
  const bytes = new Uint8Array(buf);
  let str = '';
  bytes.forEach(b => str += String.fromCharCode(b));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── Login Page ───────────────────────────────────────────────────────────────

export default function Login() {
  const navigate = useNavigate();
  const { login, setUser, loading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  // ── Handle Google OAuth redirect ────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const userRaw = params.get('user');
    const error = params.get('error');

    if (error) {
      setFormError(decodeURIComponent(error));
      window.history.replaceState({}, '', '/login');
      return;
    }

    if (token && userRaw) {
      try {
        const user = JSON.parse(decodeURIComponent(userRaw));
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        setUser(user);
        navigate('/dashboard');
      } catch (e) {
        setFormError('Google sign-in failed. Please try again.');
      }
      window.history.replaceState({}, '', '/login');
    }
  }, [navigate, setUser]);

  // ── Email/password login ────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    if (!email || !password) {
      setFormError('Enter your email and password to sign in.');
      return;
    }
    try {
      await login({ email, password });
      navigate('/dashboard');
    } catch (err) {
      setFormError(err.message);
    }
  }

  // ── Google login success handler ────────────────────────────────────────
  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await api.post('/auth/google/verify', { credential: credentialResponse.credential });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setUser(res.data.user);
      navigate('/dashboard');
    } catch (err) {
      setFormError(err.response?.data?.message || 'Google login failed on backend.');
    }
  };

  // ── Passkey login ───────────────────────────────────────────────────────
  async function handlePasskeyLogin() {
    if (!window.PublicKeyCredential) {
      setFormError('Your browser does not support passkeys.');
      return;
    }
    setPasskeyLoading(true);
    setFormError('');
    try {
      // 1. Get challenge from server
      const { data: options } = await api.post('/auth/passkey/auth-options', { email });

      // 2. Build PublicKeyCredentialRequestOptions
      const publicKey = {
        challenge: base64urlToBuffer(options.challenge),
        timeout: options.timeout || 60000,
        rpId: options.rpId,
        userVerification: options.userVerification || 'preferred',
        allowCredentials: (options.allowCredentials || []).map(c => ({
          id: base64urlToBuffer(c.id),
          type: c.type,
        })),
      };

      // 3. Prompt browser for passkey
      const credential = await navigator.credentials.get({ publicKey });

      // 4. Send response to server
      const res = await api.post('/auth/passkey/auth', {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        response: {
          clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
          authenticatorData: bufferToBase64url(credential.response.authenticatorData),
          signature: bufferToBase64url(credential.response.signature),
          userHandle: credential.response.userHandle
            ? bufferToBase64url(credential.response.userHandle)
            : null,
        },
        type: credential.type,
      });

      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setUser(res.data.user);
      navigate('/dashboard');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setFormError('Passkey authentication was cancelled.');
      } else if (err.name === 'InvalidStateError') {
        setFormError('No passkey registered. Please sign in with password and register a passkey in Settings.');
      } else {
        setFormError(err.response?.data?.message || err.message || 'Passkey authentication failed.');
      }
    } finally {
      setPasskeyLoading(false);
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
        <form onSubmit={handleSubmit}>
          {formError && (
            <div className="banner banner-error">
              <Icon name="alert" size={16} />
              <span>{formError}</span>
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
              />
            </div>
          </div>

          <div className="field">
            <div className="field-label-row">
              <label htmlFor="password">Password</label>
              <Link to="/forgot-password" className="link-sm">Forgot password?</Link>
            </div>
            <div className="input-wrap">
              <Icon name="lock" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
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

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
            {!loading && <Icon name="arrowRight" size={18} />}
          </button>

          <div className="auth-switch">
            New to FileSphere? <Link to="/signup">Create account</Link>
          </div>

          <div className="divider-row">or continue with</div>

          <div className="oauth-row">
            {/* Google — real OAuth via react-oauth/google */}
            <div style={{ display: 'flex', justifyContent: 'center', flex: 1 }}>
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => {
                  setFormError('Google Login Failed');
                }}
                shape="rectangular"
                theme="outline"
                text="signin_with"
                size="large"
              />
            </div>

            {/* Passkey */}
            <button
              type="button"
              className="btn btn-oauth btn-passkey"
              onClick={handlePasskeyLogin}
              disabled={passkeyLoading}
            >
              <Icon name="key" size={18} />
              {passkeyLoading ? 'Authenticating…' : 'Passkey'}
            </button>
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
