import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import api from '../services/api';
import { ChunkUploader } from '../utils/chunkUploader';

const FilesContext = createContext(null);

export function FilesProvider({ children }) {
  const [files, setFiles] = useState([]);
  const [storage, setStorage] = useState({ usedBytes: 0, limitBytes: 10 * 1024 * 1024 * 1024 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadingFiles, setUploadingFiles] = useState([]);

  // Tracks IDs permanently deleted/trashed client-side so they never re-appear on refetch
  const deletedIds = useRef(new Set());

  // Tracks the active view parameters to prevent incorrect screen updates on background changes
  const currentView = useRef({ type: 'folder', folderId: 'root' });

  /**
   * Fetch files/folders for a given view.
   * For regular folder browsing pass { type: 'folder', folderId: 'root' | <id> }.
   * For special views pass { type: 'trash' | 'starred' | 'shared' | 'storage' }.
   */
  const fetchFiles = useCallback(async ({ type = 'folder', folderId = 'root', query = '' } = {}) => {
    currentView.current = { type, folderId };
    setLoading(true);
    setError(null);
    try {
      let url;
      if (type === 'trash') url = '/trash';
      else if (type === 'starred') url = '/starred';
      else if (type === 'shared') url = '/shared';
      else if (type === 'storage') url = '/storage';
      else if (type === 'recent') url = '/recent';
      else if (type === 'search') url = `/search?q=${encodeURIComponent(query)}`;
      else url = `/folders/${folderId}`;

      const res = await api.get(url);
      const data = res.data;

      const mappedFolders = (data.folders || []).map(f => ({
        id: f.id,
        name: f.name,
        type: 'folder',
        status: f.isTrashed ? 'trash' : 'active',
        size: f.size || 0,
        modifiedAt: new Date(f.lastAccessed || f.createdAt).toLocaleDateString(),
        starred: f.isStarred,
        shared: f.isPublic,
        publicLinkToken: f.publicLinkToken,
        path: f.parent?.name || 'My Files',
      }));

      const mappedFiles = (data.files || []).map(f => ({
        id: f.id,
        name: f.name,
        type: f.mimeType || 'file',
        status: f.isTrashed ? 'trash' : 'active',
        size: f.size,
        modifiedAt: new Date(f.lastAccessed || f.createdAt).toLocaleDateString(),
        starred: f.isStarred,
        shared: f.isPublic,
        publicLinkToken: f.publicLinkToken,
        path: f.folder?.name || 'My Files',
      }));

      // Filter out any items the user has already deleted this session
      const all = [...mappedFolders, ...mappedFiles].filter(f => !deletedIds.current.has(f.id));
      setFiles(all);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStorageStats = useCallback(async () => {
    try {
      const res = await api.get('/storage-stats');
      setStorage(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Fetch storage stats once on mount or when user changes
  useEffect(() => {
    fetchStorageStats();
  }, [fetchStorageStats]);

  const uploadJobs = useRef(new Map());

  const onJobProgress = useCallback((job) => {
    setUploadingFiles(prev => prev.map(u => u.id === job.uploadId ? { ...u, progress: job.progress } : u));
  }, []);

  const onJobStatusChange = useCallback((job) => {
    setUploadingFiles(prev => prev.map(u => u.id === job.uploadId ? { ...u, status: job.status, dbId: job.dbId } : u));
    if (job.status === 'completed') {
      fetchStorageStats();
      const { type, folderId } = currentView.current;
      const resolvedJobFolderId = job.folderId || 'root';
      const resolvedCurrentFolderId = folderId || 'root';
      
      if (type === 'folder' && resolvedJobFolderId === resolvedCurrentFolderId) {
        fetchFiles({ type: 'folder', folderId });
      } else if (type === 'recent' || type === 'storage') {
        fetchFiles({ type });
      }
    }
  }, [fetchStorageStats, fetchFiles]);

  // Queue runner — processes one batch at a time, respects pause/cancel
  const runQueue = useCallback(async (batchId) => {
    const getJobs = () =>
      Array.from(uploadJobs.current.values()).filter(j => j.batchId === batchId);

    while (true) {
      const nextJob = getJobs().find(j => j.status === 'pending');
      if (!nextJob) break; // No more pending — done or all paused/cancelled

      await nextJob.run(); // runs until complete, paused, cancelled, or error

      // If paused, wait until it becomes pending again (resume sets it to 'pending')
      if (nextJob.status === 'paused') {
        await new Promise(resolve => {
          const check = setInterval(() => {
            if (nextJob.status === 'pending' || nextJob.status === 'cancelled') {
              clearInterval(check);
              resolve();
            }
          }, 200);
        });
      }
    }
  }, []);

  const uploadFile = useCallback(async (fileBlob, folderId = null, batchId = null) => {
    const job = new ChunkUploader(fileBlob, folderId, batchId, onJobProgress, onJobStatusChange);
    uploadJobs.current.set(job.uploadId, job);

    setUploadingFiles(prev => [...prev, {
      id: job.uploadId,
      name: job.name,
      folderId: job.folderId,
      batchId: job.batchId,
      progress: 0,
      status: 'pending',
      dbId: null
    }]);

    return job.uploadId;
  }, [onJobProgress, onJobStatusChange]);

  // Called once per batch after all files are added — starts sequential processing
  const startBatch = useCallback((batchId) => {
    runQueue(batchId);
  }, [runQueue]);

  const pauseUpload = useCallback((id) => {
    const job = uploadJobs.current.get(id);
    if (job) job.pause();
  }, []);

  const resumeUpload = useCallback((id) => {
    const job = uploadJobs.current.get(id);
    if (job) {
      job.resume(); // sets status back to 'pending'
      // Re-trigger the queue for this batch
      runQueue(job.batchId);
    }
  }, [runQueue]);

  const cancelUpload = useCallback(async (id) => {
    const job = uploadJobs.current.get(id);
    if (!job) return;
    const dbId = job.dbId;
    await job.cancel();
    // If already completed, delete from DB
    if (dbId) {
      try {
        await api.post('/files/batch-revert', { fileIds: [dbId] });
        setFiles(prev => prev.filter(f => f.id !== dbId));
        fetchStorageStats();
      } catch (e) { }
    }
  }, [fetchStorageStats]);

  const pauseBatch = useCallback((batchId) => {
    const jobs = Array.from(uploadJobs.current.values()).filter(j => j.batchId === batchId);
    // 1. Instantly update UI state for all pending/uploading jobs
    setUploadingFiles(prev => prev.map(u => {
      if (u.batchId !== batchId) return u;
      if (u.status === 'uploading' || u.status === 'pending') return { ...u, status: 'paused' };
      return u;
    }));
    // 2. Abort active XHR and mark job objects
    for (const job of jobs) {
      if (job.status === 'uploading') {
        job.status = 'paused';
        if (job.controller) job.controller.abort();
      } else if (job.status === 'pending') {
        job.status = 'paused';
      }
    }
  }, []);

  const resumeBatch = useCallback((batchId) => {
    const jobs = Array.from(uploadJobs.current.values()).filter(j => j.batchId === batchId);
    for (const job of jobs) {
      if (job.status === 'paused') {
        job.resume(); // sets status to 'pending'
      }
    }
    // Re-kick the queue — it will find all the newly-pending jobs
    runQueue(batchId);
  }, [runQueue]);

  const cancelBatch = useCallback(async (batchId) => {
    const jobs = Array.from(uploadJobs.current.values()).filter(j => j.batchId === batchId);
    const completedIds = [];

    // 1. Instantly mark ALL jobs as cancelled in the UI
    setUploadingFiles(prev => prev.map(u =>
      u.batchId === batchId ? { ...u, status: 'cancelled', progress: u.progress } : u
    ));

    // 2. Abort all active XHRs immediately (synchronous — no await)
    for (const job of jobs) {
      if (job.controller) job.controller.abort();
      if (job.status === 'completed' && job.dbId) {
        completedIds.push(job.dbId);
      }
      job.status = 'cancelled';
    }

    // 3. Also remove the completed files from visible file list immediately + blacklist them
    if (completedIds.length > 0) {
      completedIds.forEach(id => deletedIds.current.add(id));
      setFiles(prev => prev.filter(f => !completedIds.includes(f.id)));
    }

    // 4. Fire all server cleanups in parallel (non-blocking for UI)
    const cleanupPromises = jobs
      .filter(j => j.chunkIndex > 0) // only ones that sent chunks
      .map(j => api.delete(`/files/upload-cancel/${j.uploadId}`).catch(() => { }));

    const dbDeletePromise = completedIds.length > 0
      ? api.post('/files/batch-revert', { fileIds: completedIds }).catch(() => { })
      : Promise.resolve();

    // Run all cleanup in background, update storage when done
    Promise.all([...cleanupPromises, dbDeletePromise]).then(() => {
      fetchStorageStats();
    });
  }, [fetchStorageStats]);

  const dismissUploads = useCallback(() => {
    setUploadingFiles(prev => prev.filter(u => u.status === 'uploading' || u.status === 'paused' || u.status === 'pending'));
    // clear completed/cancelled/error from map
    for (const [id, job] of uploadJobs.current.entries()) {
      if (job.status === 'completed' || job.status === 'cancelled' || job.status === 'error') {
        uploadJobs.current.delete(id);
      }
    }
  }, []);

  const createFolder = useCallback(async (name, parentId = null) => {
    try {
      const res = await api.post('/folders', { name, parentId });
      return res.data;
    } catch (err) {
      console.error(err);
      throw new Error(err.response?.data?.message || err.message);
    }
  }, []);

  const toggleStar = useCallback(async (id) => {
    try {
      const item = files.find(f => f.id === id);
      if (item) {
        if (item.type === 'folder') await api.post(`/folders/${id}/star`);
        else await api.post(`/files/${id}/star`);
        setFiles(prev => prev.map(f => f.id === id ? { ...f, starred: !f.starred } : f));
      }
    } catch (err) { console.error(err); }
  }, [files]);

  const toggleShare = useCallback(async (id) => {
    try {
      const item = files.find(f => f.id === id);
      if (item) {
        if (item.type === 'folder') await api.post(`/folders/${id}/share`);
        else await api.post(`/files/${id}/share`);
        setFiles(prev => prev.map(f => f.id === id ? { ...f, shared: !f.shared } : f));
      }
    } catch (err) { console.error(err); }
  }, [files]);

  const moveToTrash = useCallback(async (id) => {
    // Instantly hide from UI and remember so re-fetches don't bring it back
    deletedIds.current.add(id);
    setFiles(prev => prev.filter(f => f.id !== id));
    const item = files.find(f => f.id === id);
    if (item) {
      try {
        if (item.type === 'folder') await api.delete(`/folders/${id}`);
        else await api.delete(`/files/${id}`);
        fetchStorageStats();
      } catch (err) {
        console.error(err);
        // On failure undo the optimistic removal
        deletedIds.current.delete(id);
        setFiles(prev => [...prev, item]);
      }
    }
  }, [files, fetchStorageStats]);

  const restoreItem = useCallback(async (id) => {
    // Remove from trash view instantly
    deletedIds.current.add(id);
    setFiles(prev => prev.filter(f => f.id !== id));
    const item = files.find(f => f.id === id);
    if (item) {
      try {
        if (item.type === 'folder') await api.post(`/folders/${id}/restore`);
        else await api.post(`/files/${id}/restore`);
        // After restore succeeds, allow it to appear again in non-trash views
        deletedIds.current.delete(id);
        fetchStorageStats();
      } catch (err) {
        console.error(err);
        deletedIds.current.delete(id);
        setFiles(prev => [...prev, item]);
      }
    }
  }, [files, fetchStorageStats]);

  const deleteItemPermanently = useCallback(async (id) => {
    // Permanently remove from UI — never show again
    deletedIds.current.add(id);
    setFiles(prev => prev.filter(f => f.id !== id));
    const item = files.find(f => f.id === id);
    if (item) {
      try {
        if (item.type === 'folder') await api.delete(`/folders/${id}/permanent`);
        else await api.delete(`/files/${id}/permanent`);
        fetchStorageStats();
      } catch (err) {
        console.error(err);
        // Don't restore on error for permanent delete
      }
    }
  }, [files, fetchStorageStats]);

  const downloadFile = useCallback(async (id, name, isFolder = false) => {
    try {
      const url = isFolder ? `/folders/${id}/download` : `/files/download/${id}`;
      const res = await api.get(url, { responseType: 'blob' });
      // res.data is already a Blob when responseType is 'blob'
      const blobUrl = window.URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', isFolder ? `${name}.zip` : name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.error(err);
      let errorMsg = err.message || 'Download failed';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          errorMsg = json.message || errorMsg;
        } catch (e) { }
      } else if (err.response?.data?.message) {
        errorMsg = err.response.data.message;
      }
      throw new Error(errorMsg);
    }
  }, []);

  const shareFileWithUser = useCallback(async (id, email, permission) => {
    try {
      const res = await api.post(`/files/${id}/share-with`, { email, permission });
      return res.data;
    } catch (err) {
      console.error(err);
      throw new Error(err.response?.data?.message || err.message);
    }
  }, []);
  const generatePublicLink = useCallback(async (id, isFolder = false) => {
    try {
      const endpoint = isFolder ? `/folders/${id}/public-link` : `/files/${id}/generate-link`;
      const res = await api.post(endpoint);
      setFiles(prev => prev.map(f => f.id === id ? { ...f, publicLinkToken: res.data.publicLinkToken, shared: true } : f));
      return res.data;
    } catch (err) {
      console.error(err);
      throw new Error(err.response?.data?.message || err.message);
    }
  }, []);

  const revokePublicLink = useCallback(async (id, isFolder = false) => {
    try {
      const endpoint = isFolder ? `/folders/${id}/public-link` : `/files/${id}/revoke-link`;
      const res = await api.delete(endpoint);
      setFiles(prev => prev.map(f => f.id === id ? { ...f, publicLinkToken: null, shared: false } : f));
      return res.data;
    } catch (err) {
      console.error(err);
      throw new Error(err.response?.data?.message || err.message);
    }
  }, []);
  const value = {
    files,
    storage,
    loading,
    error,
    fetchFiles,
    fetchStorageStats,
    uploadFile,
    startBatch,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    pauseBatch,
    resumeBatch,
    cancelBatch,
    dismissUploads,
    createFolder,
    downloadFile,
    toggleStar,
    toggleShare,
    moveToTrash,
    restoreItem,
    deleteItemPermanently,
    setStorage,
    uploadingFiles,
    shareFileWithUser,
    generatePublicLink,
    revokePublicLink,
  };

  return <FilesContext.Provider value={value}>{children}</FilesContext.Provider>;
}

export { FilesContext };
