import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import api from '../services/api';

export default function PreviewModal({ file, onClose, onDownload }) {
  const [contentUrl, setContentUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [textContent, setTextContent] = useState('');

  useEffect(() => {
    if (!file) return;

    let objectUrl = null;

    const fetchFile = async () => {
      try {
        setLoading(true);
        setError(null);
        // Fetch the file as a blob
        const res = await api.get(`/files/download/${file.id}`, { responseType: 'blob' });
        
        const isTextFile = file.type && (file.type.includes('text/') || file.type.includes('application/json') || file.type.includes('javascript'));
        const isCodeFile = file.name && file.name.match(/\.(java|py|cpp|c|h|js|jsx|ts|tsx|html|css|txt|md|json|xml|yaml|yml|sh|bat)$/i);
        
        // If it's a text file or code file, read it as text
        if (isTextFile || isCodeFile) {
          const text = await res.data.text();
          setTextContent(text);
        } else {
          objectUrl = window.URL.createObjectURL(res.data);
          setContentUrl(objectUrl);
        }
      } catch (err) {
        let errorMsg = err.message || 'Failed to load preview';
        if (err.response?.data instanceof Blob) {
          try {
            const text = await err.response.data.text();
            const json = JSON.parse(text);
            errorMsg = json.message || errorMsg;
          } catch (e) {}
        } else if (err.response?.data?.message) {
          errorMsg = err.response.data.message;
        }
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    };

    fetchFile();

    return () => {
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
    };
  }, [file]);

  if (!file) return null;

  const renderContent = () => {
    if (loading) {
      return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#6B7280' }}>Loading preview...</div>;
    }
    
    if (error) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#EF4444', gap: '16px' }}>
          <Icon name="alert" size={48} />
          <p>{error}</p>
        </div>
      );
    }

    if (textContent) {
      return (
        <pre style={{ margin: 0, padding: '24px', background: '#1F2937', color: '#F3F4F6', height: '100%', overflow: 'auto', borderRadius: '8px', fontSize: '14px', fontFamily: 'monospace' }}>
          <code>{textContent}</code>
        </pre>
      );
    }

    if (file.type && file.type.startsWith('image/')) {
      return <img src={contentUrl} alt={file.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />;
    }

    if (file.type && file.type.startsWith('video/')) {
      return <video src={contentUrl} controls style={{ maxWidth: '100%', maxHeight: '100%' }} />;
    }

    if (file.type === 'application/pdf') {
      return <iframe src={contentUrl} title={file.name} style={{ width: '100%', height: '100%', border: 'none', borderRadius: '8px' }} />;
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#6B7280', gap: '16px' }}>
        <Icon name="file" size={64} style={{ color: '#D1D5DB' }} />
        <p>No preview available for this file type.</p>
        <button className="btn btn-primary" onClick={() => onDownload(file.id, file.name, false)}>
          <Icon name="download" size={16} /> Download File
        </button>
      </div>
    );
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1000, display: 'flex', padding: '40px' }} onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={e => e.stopPropagation()} 
        style={{ width: '100%', maxWidth: '1000px', height: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '12px', overflow: 'hidden' }}
      >
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F9FAFB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
            <Icon name="file" size={20} style={{ color: '#6B7280' }} />
            <h3 style={{ margin: 0, fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</h3>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="icon-btn" onClick={() => onDownload(file.id, file.name, false)} title="Download" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
              <Icon name="download" size={18} />
            </button>
            <button className="icon-btn" onClick={onClose} title="Close" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
              <Icon name="x" size={18} />
            </button>
          </div>
        </div>
        <div style={{ flex: 1, padding: '24px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#E5E7EB' }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
