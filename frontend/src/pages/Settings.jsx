import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import EmptyState from '../components/EmptyState';
import Icon from '../components/Icon';
import { useAuth } from '../context/useAuth';
import { useFiles } from '../context/useFiles';
import api from '../services/api';

function ToggleRow({ icon, title, description, checked, onChange }) {
  return (
    <div className="toggle-row">
      <div className="toggle-row-icon">
        <Icon name={icon} size={18} />
      </div>
      <div className="toggle-row-text">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <label className="switch">
        <input type="checkbox" checked={checked} onChange={onChange} />
        <span className="switch-track" />
      </label>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

export default function Settings() {
  const { user, updateUserProfile, logout } = useAuth();
  const { storage } = useFiles();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [credentialsMsg, setCredentialsMsg] = useState('');
  const [credentialsSuccess, setCredentialsSuccess] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');

  const [notifications, setNotifications] = useState({
    webhookEvents: false,
    emailAlerts: false,
    smsSecurity: false,
  });

  const [sessions, setSessions] = useState([]);

  // Sync state with user data
  useEffect(() => {
    if (user) {
      setEditName(user.name || '');
      setEditRole(user.role || '');
      setNotifications({
        webhookEvents: user.webhookEvents || false,
        emailAlerts: user.emailAlerts || false,
        smsSecurity: user.smsSecurity || false,
      });
    }
  }, [user]);

  // Fetch active sessions
  const fetchSessions = useCallback(async () => {
    try {
      const res = await api.get('/auth/sessions');
      setSessions(res.data);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchSessions();
    }
  }, [user, fetchSessions]);

  // ── Passkey registration ───────────────────────────────────────────────
  const [passkeyStatus, setPasskeyStatus] = useState('');
  const [passkeySuccess, setPasskeySuccess] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

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

  async function handleRegisterPasskey() {
    if (!window.PublicKeyCredential) {
      setPasskeyStatus('Your browser does not support passkeys.');
      setPasskeySuccess(false);
      return;
    }
    setPasskeyLoading(true);
    setPasskeyStatus('');
    setPasskeySuccess(false);
    try {
      // 1. Get options from server
      const { data: options } = await api.post('/auth/passkey/register-options');

      // 2. Build the PublicKeyCredentialCreationOptions
      const publicKey = {
        challenge: base64urlToBuffer(options.challenge),
        rp: options.rp,
        user: {
          id: base64urlToBuffer(options.user.id),
          name: options.user.name,
          displayName: options.user.displayName,
        },
        pubKeyCredParams: options.pubKeyCredParams,
        timeout: options.timeout,
        attestation: options.attestation || 'none',
        authenticatorSelection: options.authenticatorSelection,
        excludeCredentials: (options.excludeCredentials || []).map(c => ({
          id: base64urlToBuffer(c.id),
          type: c.type,
        })),
      };

      // 3. Trigger browser passkey UI
      const credential = await navigator.credentials.create({ publicKey });

      // 4. Register with server
      await api.post('/auth/passkey/register', {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        response: {
          clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
          attestationObject: bufferToBase64url(credential.response.attestationObject),
          authenticatorData: credential.response.getAuthenticatorData
            ? bufferToBase64url(credential.response.getAuthenticatorData())
            : undefined,
        },
        type: credential.type,
        deviceName: navigator.userAgent.includes('iPhone') ? 'iPhone' :
                    navigator.userAgent.includes('Android') ? 'Android' : 'This device',
      });

      setPasskeySuccess(true);
      setPasskeyStatus('Passkey registered! You can now sign in with your passkey.');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setPasskeyStatus('Passkey registration was cancelled.');
      } else if (err.name === 'InvalidStateError') {
        setPasskeyStatus('A passkey for this account already exists on this device.');
        setPasskeySuccess(true);
      } else {
        setPasskeyStatus(err.response?.data?.message || err.message || 'Passkey registration failed.');
      }
      setPasskeySuccess(false);
    } finally {
      setPasskeyLoading(false);
    }
  }

  const usedPct = storage.limitBytes
    ? Math.min(100, Math.round((storage.usedBytes / storage.limitBytes) * 100))
    : 0;

  const initials = user?.name
    ? user.name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : '?';

  const memberDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : '—';

  async function handleSaveProfile(e) {
    e.preventDefault();
    try {
      await updateUserProfile({ name: editName, role: editRole });
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update profile:', err);
    }
  }

  async function toggleNotification(key) {
    const updatedVal = !notifications[key];
    setNotifications((prev) => ({ ...prev, [key]: updatedVal }));
    try {
      await updateUserProfile({ [key]: updatedVal });
    } catch (err) {
      console.error('Failed to update notification:', err);
    }
  }

  async function handleRevokeSession(id) {
    try {
      await api.delete(`/auth/sessions/${id}`);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Failed to revoke session:', err);
    }
  }

  async function handleRevokeAll() {
    try {
      await api.delete('/auth/sessions');
      setSessions((prev) => prev.filter((s) => s.current));
    } catch (err) {
      console.error('Failed to revoke all other sessions:', err);
    }
  }

  async function handleUpdateCredentials(e) {
    e.preventDefault();
    setCredentialsMsg('');
    setCredentialsSuccess(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setCredentialsMsg('Fill in all three fields to update your password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setCredentialsMsg('New password and confirmation do not match.');
      return;
    }

    try {
      // Direct pass to profile update or separate change password endpoint
      await api.put('/auth/profile', { currentPassword, newPassword });
      setCredentialsSuccess(true);
      setCredentialsMsg('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setCredentialsMsg(err.response?.data?.message || err.message);
    }
  }

  async function handleDeleteAccount() {
    if (window.confirm('Are you absolutely sure you want to delete your account? This action is irreversible.')) {
      try {
        await api.delete('/auth/profile');
        logout();
        window.location.href = '/login';
      } catch (err) {
        alert(err.response?.data?.message || err.message || 'Failed to delete account.');
      }
    }
  }

  return (
    <div className="app-shell">
      <Sidebar onUploadClick={() => window.location.href = '/dashboard'} />

      <main className="main-pane">
        <Topbar searchPlaceholder="Search settings…" />

        <h1 className="page-title">User settings</h1>

        <div className="settings-grid">
          <section className="card profile-card">
            <div className="profile-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-green-900)', color: '#fff', fontSize: '28px', fontWeight: 'bold' }}>
              {initials}
            </div>
            <div className="profile-info" style={{ flex: 1 }}>
              {isEditing ? (
                <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Full name"
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', width: '100%', fontSize: '0.9rem' }}
                  />
                  <input
                    type="text"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    placeholder="Role (e.g. Developer, Designer)"
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', width: '100%', fontSize: '0.9rem' }}
                  />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button type="submit" className="btn btn-primary btn-sm" style={{ width: 'auto' }}>Save</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setIsEditing(false)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div style={{ marginBottom: '14px' }}>
                  <h2>{user?.name || 'Your name'}</h2>
                  <p className="profile-role">{user?.role || 'Add a role in your profile'}</p>
                  <button
                    className="link-sm"
                    onClick={() => setIsEditing(true)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-green-700)', fontWeight: 'bold' }}
                  >
                    Edit profile
                  </button>
                </div>
              )}
              <div className="profile-meta">
                <div>
                  <span className="meta-label">Email address</span>
                  <span>{user?.email || 'Not set'}</span>
                </div>
                <div>
                  <span className="meta-label">Member since</span>
                  <span>{memberDate}</span>
                </div>
              </div>
            </div>
          </section>



          <section className="card">
            <h3 className="card-title"><Icon name="lock" size={18} /> Account security</h3>
            <form onSubmit={handleUpdateCredentials}>
              {credentialsMsg && (
                <div className={`banner ${credentialsSuccess ? 'banner-success' : 'banner-error'}`} style={{ color: credentialsSuccess ? '#2f4e3b' : 'var(--color-danger)', backgroundColor: credentialsSuccess ? '#dce8df' : 'var(--color-danger-bg)' }}>
                  <Icon name={credentialsSuccess ? 'check' : 'alert'} size={16} />
                  <span>{credentialsMsg}</span>
                </div>
              )}
              <div className="field">
                <label htmlFor="currentPassword">Current password</label>
                <div className="input-wrap">
                  <Icon name="lock" />
                  <input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="newPassword">New password</label>
                  <div className="input-wrap">
                    <Icon name="lock" />
                    <input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="confirmNewPassword">Confirm</label>
                  <div className="input-wrap">
                    <Icon name="shield" />
                    <input
                      id="confirmNewPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <button type="submit" className="btn btn-primary btn-sm">Update credentials</button>
            </form>
          </section>

          <section className="card">
            <h3 className="card-title"><Icon name="bell" size={18} /> Notification preferences</h3>
            <ToggleRow
              icon="share"
              title="Webhook events"
              description="Notify on storage bucket changes."
              checked={notifications.webhookEvents}
              onChange={() => toggleNotification('webhookEvents')}
            />
            <ToggleRow
              icon="mail"
              title="Email alerts"
              description="Weekly storage usage summary."
              checked={notifications.emailAlerts}
              onChange={() => toggleNotification('emailAlerts')}
            />
            <ToggleRow
              icon="phone"
              title="SMS security notifications"
              description="Alert on new login devices."
              checked={notifications.smsSecurity}
              onChange={() => toggleNotification('smsSecurity')}
            />
          </section>

          <section className="card">
            <h3 className="card-title"><Icon name="key" size={18} /> Passkeys</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-ink-soft)', marginBottom: '16px' }}>
              Register a passkey to sign in without a password using your device's biometrics (Face ID, fingerprint, or PIN).
            </p>
            {passkeyStatus && (
              <div className={`banner ${passkeySuccess ? 'banner-success' : 'banner-error'}`} style={{ marginBottom: '12px' }}>
                <Icon name={passkeySuccess ? 'check' : 'alert'} size={16} />
                <span>{passkeyStatus}</span>
              </div>
            )}
            <button
              className="btn btn-primary btn-sm"
              onClick={handleRegisterPasskey}
              disabled={passkeyLoading}
              style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
            >
              <Icon name="key" size={16} />
              {passkeyLoading ? 'Registering…' : 'Register a passkey on this device'}
            </button>
          </section>

          <section className="card sessions-card">
            <div className="card-title-row">
              <h3 className="card-title"><Icon name="laptop" size={18} /> Active sessions</h3>
              {sessions.filter(s => !s.current).length > 0 && (
                <button className="link-sm" onClick={handleRevokeAll} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-green-700)', fontWeight: 'bold' }}>
                  Revoke all others
                </button>
              )}
            </div>

            {sessions.length === 0 ? (
              <EmptyState
                icon="laptop"
                title="No session data yet"
                description="Active sessions will appear here once your backend reports them."
              />
            ) : (
              sessions.map((s) => (
                <div key={s.id} className="session-row" style={{ padding: '12px 0' }}>
                  <Icon name={s.deviceIcon || 'laptop'} size={20} style={{ color: 'var(--color-ink-soft)' }} />
                  <div className="session-text" style={{ marginLeft: '12px' }}>
                    <strong>
                      {s.device}
                      {s.current && <span className="tag-current">Current</span>}
                    </strong>
                    <span>{s.detail}</span>
                  </div>
                  {!s.current && (
                    <button className="icon-btn" aria-label="Revoke session" onClick={() => handleRevokeSession(s.id)} style={{ border: 'none', cursor: 'pointer' }}>
                      <Icon name="trash" size={16} style={{ color: 'var(--color-danger)' }} />
                    </button>
                  )}
                </div>
              ))
            )}
          </section>

          <section className="card danger-card">
            <h3 className="card-title danger-title"><Icon name="alert" size={18} /> Danger zone</h3>
            <p>
              Deleting your account will permanently remove all stored files and wipe
              your configuration. This action is irreversible.
            </p>
            <button className="btn btn-danger" onClick={handleDeleteAccount}>
              <Icon name="trash" size={16} /> Delete account
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}
