import React, { useState } from 'react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import Icon from '../components/Icon';
import { Link } from 'react-router-dom';

export default function Help() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [openSection, setOpenSection] = useState('uploads');

  const categories = [
    { id: 'all', label: 'All Topics', icon: 'help' },
    { id: 'uploads', label: 'Uploads & Storage', icon: 'upload' },
    { id: 'sharing', label: 'Sharing & Links', icon: 'share' },
    { id: 'security', label: 'Passkeys & Security', icon: 'shield' },
    { id: 'management', label: 'Organization & Trash', icon: 'folder' },
    { id: 'smtp', label: 'SMTP & Notifications', icon: 'mail' },
  ];

  const guideSections = [
    {
      id: 'uploads',
      category: 'uploads',
      title: 'High-Speed Uploading & Chunking',
      icon: 'upload',
      summary: 'Upload single files, multi-file batches, or entire folder trees with zero lag.',
      content: (
        <div>
          <p style={{ marginBottom: '12px', color: '#4B5563', lineHeight: 1.6 }}>
            FileSphere is engineered for maximum throughput using an intelligent hybrid upload engine:
          </p>
          <ul style={{ paddingLeft: '20px', color: '#374151', lineHeight: 1.8, marginBottom: '16px' }}>
            <li>
              <b>Direct Stream Uploads (&le; 50MB)</b>: Everyday documents, images, and videos are uploaded directly in a single high-throughput HTTP stream with real-time percentage progress.
            </li>
            <li>
              <b>Resumable 8MB Chunking (&gt; 50MB)</b>: Large files are automatically sliced into 8MB binary chunks on the client, transmitted reliably, and assembled asynchronously on the server.
            </li>
            <li>
              <b>Parallel Upload Workers</b>: When selecting multiple files or uploading entire directories, FileSphere uploads up to <b>4 files simultaneously</b> in parallel.
            </li>
            <li>
              <b>Folder Upload & Drag-and-Drop</b>: Drag any folder directly onto the dashboard or click "Upload folder" in the sidebar to recreate your local directory structure instantly.
            </li>
          </ul>
          <div style={{ background: '#F3F4F6', padding: '12px 16px', borderRadius: '8px', fontSize: '13px', color: '#1F2937' }}>
            💡 <b>Instant Reflection</b>: Uploaded files appear in your dashboard in 0ms upon completion without requiring full-page reload spinners.
          </div>
        </div>
      )
    },
    {
      id: 'sharing',
      category: 'sharing',
      title: 'File Sharing, Permissions & Public Links',
      icon: 'share',
      summary: 'Collaborate with team members via email sharing or generate public download links.',
      content: (
        <div>
          <p style={{ marginBottom: '12px', color: '#4B5563', lineHeight: 1.6 }}>
            FileSphere provides two flexible ways to distribute and collaborate on files:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px', background: '#FAFAFA' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon name="user" size={16} /> User-to-User Email Sharing
              </h4>
              <p style={{ fontSize: '13px', color: '#4B5563', lineHeight: 1.5, marginBottom: '8px' }}>
                Share directly with another registered user by entering their email in the Share modal:
              </p>
              <ul style={{ fontSize: '12px', color: '#6B7280', paddingLeft: '16px', lineHeight: 1.6 }}>
                <li><b>VIEW</b>: Read-only preview and download.</li>
                <li><b>EDIT</b>: Full collaborative access.</li>
                <li>Instant notification bell badge on the recipient’s topbar.</li>
              </ul>
            </div>
            <div style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px', background: '#FAFAFA' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon name="globe" size={16} /> Public Shareable Links
              </h4>
              <p style={{ fontSize: '13px', color: '#4B5563', lineHeight: 1.5, marginBottom: '8px' }}>
                Generate a public download token anyone with the link can access without logging in:
              </p>
              <ul style={{ fontSize: '12px', color: '#6B7280', paddingLeft: '16px', lineHeight: 1.6 }}>
                <li>One-click copy to clipboard.</li>
                <li>Folders are automatically zipped on the fly.</li>
                <li>Click <b>Unpublish Link</b> at any time to immediately revoke access.</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'security',
      category: 'security',
      title: 'Passkeys (WebAuthn) & Passwordless Login',
      icon: 'key',
      summary: 'Log in securely with fingerprint, Face ID, Windows Hello, or hardware security keys.',
      content: (
        <div>
          <p style={{ marginBottom: '12px', color: '#4B5563', lineHeight: 1.6 }}>
            FileSphere supports <b>FIDO2 / WebAuthn Passkeys</b>, the modern standard for passwordless, phishing-resistant authentication:
          </p>
          <ol style={{ paddingLeft: '20px', color: '#374151', lineHeight: 1.8, marginBottom: '16px' }}>
            <li>Navigate to <b>Settings &rarr; Security &amp; Passkeys</b>.</li>
            <li>Click <b>Register New Passkey</b> and complete your device biometric prompt (e.g. Touch ID, Face ID, Windows Hello, or YubiKey).</li>
            <li>Give your passkey a recognizable device name (e.g., <i>MacBook Pro Touch ID</i>).</li>
            <li>On the login page, simply click <b>Sign in with Passkey</b> for instant 1-click passwordless login.</li>
          </ol>
        </div>
      )
    },
    {
      id: 'management',
      category: 'management',
      title: 'Folder Structure, Starred Items & Trash Lifecycle',
      icon: 'folder',
      summary: 'Organize files, bookmark important documents, and recover items from Trash.',
      content: (
        <div>
          <ul style={{ paddingLeft: '20px', color: '#374151', lineHeight: 1.8, marginBottom: '16px' }}>
            <li>
              <b>Starred Items</b>: Click the star icon on any file or folder to pin it. Access all starred items at once via the <b>Starred</b> sidebar link.
            </li>
            <li>
              <b>Two-Tier Trash System</b>: Moving an item to trash is a soft-delete that immediately removes it from active views without losing your data.
            </li>
            <li>
              <b>Restore &amp; Permanent Purge</b>: In the <b>Trash</b> view, you can restore any item back to its original folder or permanently delete it to free up quota.
            </li>
            <li>
              <b>Previews</b>: Click the preview eye icon to instantly inspect images, PDFs, text, and code files (JS, TS, Python, HTML, CSS, JSON, Markdown).
            </li>
          </ul>
        </div>
      )
    },
    {
      id: 'storage',
      category: 'uploads',
      title: 'Storage Quota & File Categorization',
      icon: 'database',
      summary: 'Understand your 10GB cloud storage allotment and breakdown analytics.',
      content: (
        <div>
          <p style={{ marginBottom: '12px', color: '#4B5563', lineHeight: 1.6 }}>
            Every FileSphere account comes with <b>10GB of high-speed cloud storage</b>.
          </p>
          <p style={{ color: '#4B5563', lineHeight: 1.6, marginBottom: '12px' }}>
            The sidebar displays your live storage bar. Clicking <b>Storage</b> provides a breakdown across categories:
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <span style={{ background: '#EFF6FF', color: '#1D4ED8', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 500 }}>🖼️ Images (.png, .jpg, .svg, .webp)</span>
            <span style={{ background: '#ECFDF5', color: '#047857', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 500 }}>🎥 Videos (.mp4, .mov, .mkv)</span>
            <span style={{ background: '#FEF3C7', color: '#B45309', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 500 }}>📄 Documents (.pdf, .docx, .txt)</span>
            <span style={{ background: '#F3F4F6', color: '#374151', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 500 }}>📦 Other (archives, code, audio)</span>
          </div>
        </div>
      )
    },
    {
      id: 'smtp',
      category: 'smtp',
      title: 'SMTP Email Delivery Configuration',
      icon: 'mail',
      summary: 'Configuring SMTP for automated file share notifications and password reset emails.',
      content: (
        <div>
          <p style={{ marginBottom: '12px', color: '#4B5563', lineHeight: 1.6 }}>
            FileSphere uses Nodemailer to dispatch real emails for password resets and file share alerts:
          </p>
          <div style={{ background: '#1E293B', color: '#F8FAFC', padding: '16px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12px', marginBottom: '16px', overflowX: 'auto' }}>
            <div># Example .env configuration for Gmail / SendGrid / Brevo / SES</div>
            <div>SMTP_HOST="smtp.gmail.com"</div>
            <div>SMTP_PORT=587</div>
            <div>SMTP_USER="your-email@gmail.com"</div>
            <div>SMTP_PASS="your-16-character-app-password"</div>
            <div>CLIENT_URL="https://your-domain.com"</div>
          </div>
          <p style={{ fontSize: '13px', color: '#6B7280' }}>
            If SMTP credentials are not configured, FileSphere operates safely in simulation mode by logging notifications and reset tokens to the server console.
          </p>
        </div>
      )
    }
  ];

  const filteredSections = guideSections.filter(s => {
    const matchesCategory = activeCategory === 'all' || s.category === activeCategory;
    const matchesQuery = !searchQuery.trim() || 
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.summary.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <div className="main-content">
        <Topbar searchPlaceholder="Search help articles…" onSearch={q => setSearchQuery(q)} />
        
        <main style={{ padding: '32px 40px', maxWidth: '1100px', margin: '0 auto' }}>
          {/* Header Banner */}
          <div style={{ marginBottom: '32px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
              FileSphere Help Center &amp; Documentation
            </h1>
            <p style={{ fontSize: '15px', color: '#6B7280', maxWidth: '600px', margin: '0 auto' }}>
              Everything you need to know about high-speed uploads, file sharing, public publishing, security passkeys, and storage management.
            </p>
          </div>

          {/* Quick Categories Bar */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '16px', marginBottom: '24px', borderBottom: '1px solid #E5E7EB' }}>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  border: '1px solid',
                  borderColor: activeCategory === cat.id ? '#4F46E5' : '#E5E7EB',
                  background: activeCategory === cat.id ? '#EEF2FF' : '#fff',
                  color: activeCategory === cat.id ? '#4F46E5' : '#4B5563',
                  fontSize: '13px',
                  fontWeight: activeCategory === cat.id ? 600 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 120ms ease'
                }}
              >
                <Icon name={cat.icon} size={15} />
                {cat.label}
              </button>
            ))}
          </div>

          {/* Articles / Accordion list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {filteredSections.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 16px', color: '#6B7280' }}>
                <Icon name="search" size={36} style={{ opacity: 0.4, margin: '0 auto 12px' }} />
                <h3>No matching help topics found</h3>
                <p style={{ fontSize: '13px', marginTop: '4px' }}>Try searching with different keywords or switch categories.</p>
              </div>
            ) : (
              filteredSections.map(section => {
                const isOpen = openSection === section.id;
                return (
                  <div
                    key={section.id}
                    style={{
                      background: '#fff',
                      borderRadius: '12px',
                      border: '1px solid #E5E7EB',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      overflow: 'hidden',
                      transition: 'border-color 150ms ease'
                    }}
                  >
                    <div
                      onClick={() => setOpenSection(isOpen ? null : section.id)}
                      style={{
                        padding: '18px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        background: isOpen ? '#FAFAFA' : '#fff'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#EEF2FF', color: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name={section.icon} size={20} />
                        </div>
                        <div>
                          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', margin: 0 }}>
                            {section.title}
                          </h3>
                          <p style={{ fontSize: '13px', color: '#6B7280', margin: '2px 0 0 0' }}>
                            {section.summary}
                          </p>
                        </div>
                      </div>
                      <button
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#9CA3AF' }}
                        aria-label="Toggle details"
                      >
                        <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} />
                      </button>
                    </div>

                    {isOpen && (
                      <div style={{ padding: '20px 24px 24px 24px', borderTop: '1px solid #F3F4F6' }}>
                        {section.content}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Quick Links */}
          <div style={{ marginTop: '40px', padding: '24px', background: '#EEF2FF', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#312E81', margin: '0 0 4px 0' }}>
                Ready to get started?
              </h4>
              <p style={{ fontSize: '13px', color: '#4338CA', margin: 0 }}>
                Jump back into your dashboard to upload files or configure your passkeys.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <Link to="/dashboard" className="btn btn-primary btn-sm" style={{ textDecoration: 'none', width: 'auto' }}>
                Go to Dashboard
              </Link>
              <Link to="/settings" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none', width: 'auto', background: '#fff' }}>
                Account Settings
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
