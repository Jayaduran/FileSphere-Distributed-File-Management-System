import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { useAuth } from '../context/useAuth';

export default function Signup() {
  const navigate = useNavigate();
  const { signup, loading } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [formError, setFormError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');

    if (!fullName.trim() || !email.trim() || !password || !confirmPassword) {
      setFormError('Fill in every field to create your account.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }
    if (!agreed) {
      setFormError('Accept the Terms of Service and Privacy Policy to continue.');
      return;
    }

    try {
      // AuthContext.signup reads newAccount.name — pass fullName as 'name'
      await signup({ name: fullName.trim(), email: email.trim(), password });
      navigate('/dashboard');
    } catch (err) {
      setFormError(err.message);
    }
  }

  return (
    <div className="signup-page">
      <header className="signup-topbar">
        <span className="brand-name-sm">FileSphere</span>
        <nav className="signup-nav">
          <span className="status-pill"><span className="dot" /> System online</span>
          <Link to="/pricing">Pricing</Link>
          <Link to="/security">Security</Link>
          <Link to="/login" className="nav-cta">Sign in</Link>
        </nav>
      </header>

      <div className="signup-body">
        <div className="signup-pitch">
          <h1>
            Secure your digital <span className="accent">roots</span> in the cloud.
          </h1>
          <p className="pitch-copy">
            FileSphere bridges powerful cloud storage infrastructure with a calm,
            organic interface — built for people who want their files kept safely
            and simply.
          </p>

          <div className="pitch-grid">
            <div className="pitch-photo" role="img" aria-label="Brand photography placeholder" />
            <div className="pitch-stat">
              <Icon name="cloud" size={26} />
              <div>
                <strong>99.9% uptime</strong>
                <span>Enterprise-grade storage stability.</span>
              </div>
            </div>
          </div>

          <div className="pitch-banner pitch-banner-gradient">
            <h3>Cloud-native, heart-focused.</h3>
            <p>Simple storage for human lives.</p>
          </div>
        </div>

        <div className="auth-card signup-card">
          <h2>Create account</h2>
          <p className="card-subtitle">Begin your journey with FileSphere today.</p>

          <form onSubmit={handleSubmit} noValidate>
            {formError && (
              <div className="banner banner-error">
                <Icon name="alert" size={16} />
                <span>{formError}</span>
              </div>
            )}

            <div className="field">
              <label htmlFor="fullName">Full name</label>
              <div className="input-wrap">
                <Icon name="user" />
                <input
                  id="fullName"
                  type="text"
                  autoComplete="name"
                  placeholder="Your name"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="signupEmail">Email address</label>
              <div className="input-wrap">
                <Icon name="mail" />
                <input
                  id="signupEmail"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="signupPassword">Password</label>
              <div className="input-wrap">
                <Icon name="lock" />
                <input
                  id="signupPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Create a password"
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

            <div className="field">
              <label htmlFor="confirmPassword">Verify password</label>
              <div className="input-wrap">
                <Icon name="shield" />
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
              />
              <span>
                I agree to the <Link to="/terms">Terms of Service</Link> and{' '}
                <Link to="/privacy">Privacy Policy</Link>.
              </span>
            </label>

            <button
              id="signup-submit-btn"
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Creating account…' : 'Create account'}
              {!loading && <Icon name="arrowRight" size={18} />}
            </button>

            <div className="auth-switch">
              Already have an account? <Link to="/login">Sign in</Link>
            </div>

            <div className="divider-row">or join with</div>

            <div className="oauth-row">
              <button
                type="button"
                id="signup-google-btn"
                className="btn btn-oauth btn-google"
                onClick={() => { window.location.href = '/api/auth/google'; }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
            </div>
          </form>
        </div>
      </div>

      <footer className="signup-footer">
        <p>Data encrypted at rest and in transit.</p>
      </footer>
    </div>
  );
}
