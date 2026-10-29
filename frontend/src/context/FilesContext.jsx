import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import api from '../services/api';
import { ChunkUploader } from '../utils/chunkUploader';

const FilesContext = createContext(null);
const MAX_CONCURRENT_UPLOADS = 4;

export function FilesProvider({ children }) {
  const [files, setFiles] = useState([]);
  const [storage, setStorage] = useState({ usedBytes: 0, limitBytes: 10 * 1024 * 1024 * 1024 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadingFiles, setUploadingFiles] = useState([]);

  // Tracks IDs permanently deleted client-side so they never re-appear on refetch
  const permanentlyDeletedIds = useRef(new Set());

  // Tracks the active view parameters to prevent incorrect screen updates on background changes
  const currentView = useRef({ type: 'folder', folderId: 'root' });

  // SWR View Cache for instant 0ms navigation between sections
  const viewCache = useRef(new Map());

  // Debounced background sync timer
  const syncTimeout = useRef(null);
  const activeFetchId = useRef(0);

  /**
   * Fetch files/folders for a given view.
   * For regular folder browsing pass { type: 'folder', folderId: 'root' | <id> }.
   * For special views pass { type: 'trash' | 'starred' | 'shared' | 'storage' }.
   * SWR pattern: immediately serves cached view in 0ms, revalidates seamlessly in background.
   */
  const fetchFiles = useCallback(async ({ type = 'folder', folderId = 'root', query = '' } = {}, silent = false) => {
    const fetchId = ++activeFetchId.current;
    currentView.current = { type, folderId, query };
    const cacheKey = `${type}_${folderId}_${query}`;

    // 0ms instant display if cached view exists on navigation
    if (!silent) {
      if (viewCache.current.has(cacheKey)) {
        const cached = viewCache.current.get(cacheKey).filter(f => !permanentlyDeletedIds.current.has(f.id));
        setFiles(cached);
        setLoading(false);
      } else {
        // Clear previous section files so UI doesn't show old section data
        setFiles([]);
        setLoading(true);
      }
    }

    setError(null);
    try {
      let url;
      if (type === 'trash') url = '/trash';
      else if (type === 'starred') url = '/starred';
      else if (type === 'shared') url = '/shared';
      else if (type === 'shared-with-me') url = '/shared?scope=with-me';
      else if (type === 'shared-by-me') url = '/shared?scope=by-me';
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
        folderId: f.parentId || null,
        modifiedAt: new Date(f.lastAccessed || f.createdAt).toLocaleDateString(),
        rawDate: f.lastAccessed || f.createdAt,
        timestamp: new Date(f.lastAccessed || f.createdAt).getTime(),
        starred: f.isStarred,
        shared: f.isPublic,
        publicLinkToken: f.publicLinkToken,
        path: f.parent?.name || 'My Files',
        sharedBy: f.sharedBy || null,
        sharedWithUser: f.sharedWithUser || null,
        shareScope: f.shareScope || (f.sharedBy ? 'with-me' : 'by-me'),
        permission: f.permission || null,
        sharedAt: f.sharedAt || null,
      }));

      const mappedFiles = (data.files || []).map(f => ({
        id: f.id,
        name: f.name,
        type: f.mimeType || 'file',
        status: f.isTrashed ? 'trash' : 'active',
        size: f.size,
        folderId: f.folderId || null,
        modifiedAt: new Date(f.lastAccessed || f.createdAt).toLocaleDateString(),
        rawDate: f.lastAccessed || f.createdAt,
        timestamp: new Date(f.lastAccessed || f.createdAt).getTime(),
        starred: f.isStarred,
        shared: f.isPublic,
        publicLinkToken: f.publicLinkToken,
        path: f.folder?.name || 'My Files',
        sharedBy: f.sharedBy || null,
        sharedWithUser: f.sharedWithUser || null,
        shareScope: f.shareScope || (f.sharedBy ? 'with-me' : 'by-me'),
        permission: f.permission || null,
        sharedAt: f.sharedAt || null,
      }));

      // Filter out any items permanently deleted this session
      const serverItems = [...mappedFolders, ...mappedFiles].filter(f => !permanentlyDeletedIds.current.has(f.id));
      viewCache.current.set(cacheKey, serverItems);

      // ONLY apply to state if this fetch is STILL the latest active view request!
      if (fetchId === activeFetchId.current) {
        setFiles(prev => {
          const uploadingItems = prev.filter(f => f.isOptimistic || f.status === 'uploading');
          const activeUploads = uploadingItems.filter(u => !serverItems.some(s => s.id === u.id || s.name === u.name));
          return [...activeUploads, ...serverItems];
        });
      }
    } catch (err) {
      console.error(err);
      if (fetchId === activeFetchId.current) {
        setError(err.response?.data?.message || err.message);
      }
    } finally {
      if (fetchId === activeFetchId.current && !silent) {
        setLoading(false);
      }
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

  const triggerBackgroundSync = useCallback(() => {
    if (syncTimeout.current) clearTimeout(syncTimeout.current);
    syncTimeout.current = setTimeout(() => {
      fetchStorageStats();
      const { type, folderId } = currentView.current;
      fetchFiles({ type, folderId }, true);
    }, 400);
  }, [fetchStorageStats, fetchFiles]);

  // Initial load: fast root folder first
  useEffect(() => {
    fetchStorageStats();
    const token = localStorage.getItem('token');
    if (!token) return;

    // Load active view immediately
    fetchFiles({ type: 'folder', folderId: 'root' }, false).catch(() => {});
  }, []);

  const uploadJobs = useRef(new Map());

  const onJobProgress = useCallback((job) => {
    setUploadingFiles(prev => prev.map(u => u.id === job.uploadId ? { ...u, progress: job.progress } : u));
    setFiles(prev => prev.map(f => f.tempUploadId === job.uploadId ? { ...f, progress: job.progress } : f));
  }, []);

  const onJobStatusChange = useCallback((job) => {
    setUploadingFiles(prev => {
      const updated = prev.map(u => u.id === job.uploadId ? { ...u, status: job.status, dbId: job.dbId } : u);
      
      // Auto-dismiss the completed/cancelled/error batch panel after 4 seconds
      const batchId = job.batchId;
      const batchFiles = updated.filter(u => u.batchId === batchId);
      const allDone = batchFiles.length > 0 && batchFiles.every(f => f.status === 'completed' || f.status === 'cancelled' || f.status === 'error');
      
      if (allDone) {
        setTimeout(() => {
          setUploadingFiles(current => current.filter(u => u.batchId !== batchId));
          for (const [uid, j] of uploadJobs.current.entries()) {
            if (j.batchId === batchId && (j.status === 'completed' || j.status === 'cancelled' || j.status === 'error')) {
              uploadJobs.current.delete(uid);
            }
          }
        }, 4000);
      }
      
      return updated;
    });

    if (job.status === 'completed') {
      // Instant UI Reflection: Immediately inject or swap file into view without waiting for network re-fetch
      if (job.uploadedFile) {
        const dbFile = job.uploadedFile;
        const newFileItem = {
          id: dbFile.id,
          name: dbFile.name,
          type: dbFile.mimeType || 'file',
          status: dbFile.isTrashed ? 'trash' : 'active',
          size: dbFile.size,
          modifiedAt: new Date(dbFile.lastAccessed || dbFile.createdAt || Date.now()).toLocaleDateString(),
          starred: dbFile.isStarred || false,
          shared: dbFile.isPublic || false,
          publicLinkToken: dbFile.publicLinkToken || null,
          path: dbFile.folder?.name || 'My Files',
          sharedBy: null,
          permission: null,
          isOptimistic: false,
        };

        const { type, folderId } = currentView.current;
        const resolvedJobFolderId = job.folderId === 'root' || !job.folderId ? null : job.folderId;
        const resolvedCurrentFolderId = folderId === 'root' || !folderId ? null : folderId;

        setFiles(prev => {
          const index = prev.findIndex(f => f.tempUploadId === job.uploadId || f.id === `temp-upload-${job.uploadId}` || f.id === dbFile.id);
          if (index !== -1) {
            const next = [...prev];
            next[index] = newFileItem;
            return next;
          }
          if ((type === 'folder' && resolvedJobFolderId === resolvedCurrentFolderId) || type === 'recent' || type === 'storage') {
            return [newFileItem, ...prev];
          }
          return prev;
        });

        const cacheKey = `${type}_${folderId}_`;
        if (viewCache.current.has(cacheKey)) {
          const cached = viewCache.current.get(cacheKey);
          const idx = cached.findIndex(f => f.tempUploadId === job.uploadId || f.id === `temp-upload-${job.uploadId}` || f.id === dbFile.id);
          if (idx !== -1) {
            const nextCached = [...cached];
            nextCached[idx] = newFileItem;
            viewCache.current.set(cacheKey, nextCached);
          } else if ((type === 'folder' && resolvedJobFolderId === resolvedCurrentFolderId) || type === 'recent' || type === 'storage') {
            viewCache.current.set(cacheKey, [newFileItem, ...cached]);
          }
        }
      }

      // Background silent refresh for exact state sync
      triggerBackgroundSync();
    }
  }, [triggerBackgroundSync]);

  const activeBatches = useRef(new Set());

  // Queue runner — processes batch with concurrent pool workers
  const runQueue = useCallback(async (batchId) => {
    if (activeBatches.current.has(batchId)) return;
    activeBatches.current.add(batchId);

    const getJobs = () =>
      Array.from(uploadJobs.current.values()).filter(j => j.batchId === batchId);

    const runWorker = async () => {
      while (true) {
        const jobs = getJobs();
        const nextJob = jobs.find(j => j.status === 'pending');
        if (!nextJob) break; // No more pending jobs

        // Claim immediately to prevent race conditions across parallel workers
        nextJob.status = 'uploading';
        await nextJob.run();

        // If batch was paused or cancelled, stop this worker immediately without lingering intervals
        if (nextJob.status === 'paused' || nextJob.status === 'cancelled') {
          const hasMorePending = getJobs().some(j => j.status === 'pending');
          if (!hasMorePending) break;
        }
      }
    };

    try {
      const workers = Array.from({ length: MAX_CONCURRENT_UPLOADS }, () => runWorker());
      await Promise.all(workers);
    } finally {
      activeBatches.current.delete(batchId);
    }
  }, []);

  const uploadFile = useCallback(async (fileBlob, folderId = null, batchId = null) => {
    const job = new ChunkUploader(fileBlob, folderId, batchId, onJobProgress, onJobStatusChange);
    uploadJobs.current.set(job.uploadId, job);

    const tempId = `temp-upload-${job.uploadId}`;
    const optimisticFile = {
      id: tempId,
      tempUploadId: job.uploadId,
      name: job.name,
      type: fileBlob.type || 'file',
      status: 'uploading',
      progress: 5,
      size: fileBlob.size,
      modifiedAt: 'Just now',
      starred: false,
      shared: false,
      publicLinkToken: null,
      path: 'My Files',
      sharedBy: null,
      permission: null,
      isOptimistic: true,
      folderId: job.folderId,
    };

    setUploadingFiles(prev => [...prev, {
      id: job.uploadId,
      name: job.name,
      folderId: job.folderId,
      batchId: job.batchId,
      progress: 5,
      status: 'pending',
      dbId: null
    }]);

    // Instant UI Reflection: Immediately inject file into view within 0ms!
    const { type, folderId: curFolderId } = currentView.current;
    const resolvedJobFolderId = job.folderId === 'root' || !job.folderId ? null : job.folderId;
    const resolvedCurFolderId = curFolderId === 'root' || !curFolderId ? null : curFolderId;

    if (
      (type === 'folder' && resolvedJobFolderId === resolvedCurFolderId) ||
      type === 'recent' ||
      type === 'storage'
    ) {
      setFiles(prev => [optimisticFile, ...prev.filter(f => f.id !== tempId && f.name !== job.name)]);
      
      const cacheKey = `${type}_${curFolderId}_`;
      if (viewCache.current.has(cacheKey)) {
        const cached = viewCache.current.get(cacheKey);
        viewCache.current.set(cacheKey, [optimisticFile, ...cached.filter(f => f.id !== tempId && f.name !== job.name)]);
      }
    }

    return job.uploadId;
  }, [onJobProgress, onJobStatusChange]);

  // Called once per batch after all files are added — starts concurrent processing
  const startBatch = useCallback((batchId) => {
    runQueue(batchId);
  }, [runQueue]);

  const pauseUpload = useCallback((id) => {
    const job = uploadJobs.current.get(id);
    if (job) {
      job.pause();
      setUploadingFiles(prev => prev.map(u => u.id === id ? { ...u, status: 'paused' } : u));
    }
  }, []);

  const resumeUpload = useCallback((id) => {
    const job = uploadJobs.current.get(id);
    if (job) {
      job.resume();
      setUploadingFiles(prev => prev.map(u => u.id === id ? { ...u, status: 'pending' } : u));
      runQueue(job.batchId);
    }
  }, [runQueue]);

  const cancelUpload = useCallback(async (id) => {
    const job = uploadJobs.current.get(id);
    if (!job) return;
    const dbId = job.dbId;
    job.cancel().catch(() => {});
    setUploadingFiles(prev => prev.map(u => u.id === id ? { ...u, status: 'cancelled' } : u));
    setFiles(prev => prev.filter(f => f.tempUploadId !== id && f.id !== `temp-upload-${id}`));
    for (const [key, items] of viewCache.current.entries()) {
      viewCache.current.set(key, items.filter(f => f.tempUploadId !== id && f.id !== `temp-upload-${id}`));
    }
    if (dbId) {
      try {
        await api.post('/files/batch-revert', { fileIds: [dbId] });
        setFiles(prev => prev.filter(f => f.id !== dbId));
        fetchStorageStats();
      } catch (e) { }
    }
  }, [fetchStorageStats]);

  const pauseBatch = useCallback((batchId) => {
    activeBatches.current.delete(batchId);
    const jobs = Array.from(uploadJobs.current.values()).filter(j => j.batchId === batchId);
    setUploadingFiles(prev => prev.map(u => {
      if (u.batchId !== batchId) return u;
      if (u.status === 'uploading' || u.status === 'pending') return { ...u, status: 'paused' };
      return u;
    }));
    for (const job of jobs) {
      if (job.status === 'uploading' || job.status === 'pending') {
        job.pause();
      }
    }
  }, []);

  const resumeBatch = useCallback((batchId) => {
    activeBatches.current.delete(batchId);
    const jobs = Array.from(uploadJobs.current.values()).filter(j => j.batchId === batchId);
    setUploadingFiles(prev => prev.map(u => {
      if (u.batchId !== batchId) return u;
      if (u.status === 'paused') return { ...u, status: 'pending' };
      return u;
    }));
    for (const job of jobs) {
      if (job.status === 'paused') {
        job.resume();
      }
    }
    runQueue(batchId);
  }, [runQueue]);

  const cancelBatch = useCallback(async (batchId) => {
    activeBatches.current.delete(batchId);
    const jobs = Array.from(uploadJobs.current.values()).filter(j => j.batchId === batchId);
    const completedIds = [];

    setUploadingFiles(prev => prev.map(u =>
      u.batchId === batchId ? { ...u, status: 'cancelled', progress: u.progress } : u
    ));

    for (const job of jobs) {
      if (job.status === 'completed' && job.dbId) {
        completedIds.push(job.dbId);
      }
      job.cancel().catch(() => {});
    }

    setFiles(prev => prev.filter(f => !jobs.some(j => f.tempUploadId === j.uploadId || f.id === `temp-upload-${j.uploadId}`) && !completedIds.includes(f.id)));

    for (const [key, items] of viewCache.current.entries()) {
      viewCache.current.set(key, items.filter(f => !jobs.some(j => f.tempUploadId === j.uploadId || f.id === `temp-upload-${j.uploadId}`) && !completedIds.includes(f.id)));
    }

    if (completedIds.length > 0) {
      api.post('/files/batch-revert', { fileIds: completedIds })
        .then(() => fetchStorageStats())
        .catch(() => {});
    }
  }, [fetchStorageStats]);

  const dismissUploads = useCallback(() => {
    setUploadingFiles(prev => prev.filter(u => u.status === 'uploading' || u.status === 'paused' || u.status === 'pending'));
    for (const [id, job] of uploadJobs.current.entries()) {
      if (job.status === 'completed' || job.status === 'cancelled' || job.status === 'error') {
        uploadJobs.current.delete(id);
      }
    }
  }, []);

  // Instant optimistic folder injection (0ms reflection)
  const addOptimisticFolder = useCallback((name, folderSize = 0) => {
    const tempId = `temp-folder-${Date.now()}`;
    const optimisticFolder = {
      id: tempId,
      name,
      type: 'folder',
      status: 'uploading',
      size: folderSize,
      modifiedAt: 'Just now',
      starred: false,
      shared: false,
      publicLinkToken: null,
      path: 'My Files',
      sharedBy: null,
      permission: null,
      isOptimistic: true,
    };
    setFiles(prev => [optimisticFolder, ...prev.filter(f => f.name !== name)]);
    const { type, folderId } = currentView.current;
    const cacheKey = `${type}_${folderId}_`;
    if (viewCache.current.has(cacheKey)) {
      const cached = viewCache.current.get(cacheKey);
      viewCache.current.set(cacheKey, [optimisticFolder, ...cached.filter(f => f.name !== name)]);
    }
    return tempId;
  }, []);

  const createFolder = useCallback(async (name, parentId = null) => {
    const tempId = `temp-folder-${Date.now()}`;
    const optimisticFolder = {
      id: tempId,
      name,
      type: 'folder',
      status: 'active',
      size: 0,
      modifiedAt: 'Just now',
      starred: false,
      shared: false,
      publicLinkToken: null,
      path: 'My Files',
      sharedBy: null,
      permission: null,
      isOptimistic: true,
    };
    setFiles(prev => [optimisticFolder, ...prev.filter(f => f.name !== name)]);

    try {
      const res = await api.post('/folders', { name, parentId });
      const created = res.data;
      const realFolder = {
        id: created.id,
        name: created.name,
        type: 'folder',
        status: created.isTrashed ? 'trash' : 'active',
        size: created.size || 0,
        modifiedAt: new Date(created.lastAccessed || created.createdAt || Date.now()).toLocaleDateString(),
        starred: created.isStarred || false,
        shared: created.isPublic || false,
        publicLinkToken: created.publicLinkToken || null,
        path: created.parent?.name || 'My Files',
        sharedBy: null,
        permission: null,
        isOptimistic: false,
      };
      setFiles(prev => prev.map(f => f.id === tempId ? realFolder : f));
      const { type, folderId } = currentView.current;
      const cacheKey = `${type}_${folderId}_`;
      if (viewCache.current.has(cacheKey)) {
        const cached = viewCache.current.get(cacheKey);
        viewCache.current.set(cacheKey, [realFolder, ...cached.filter(f => f.id !== tempId && f.name !== name)]);
      }
      return created;
    } catch (err) {
      setFiles(prev => prev.filter(f => f.id !== tempId));
      console.error(err);
      throw new Error(err.response?.data?.message || err.message);
    }
  }, []);

  const toggleStar = useCallback(async (id) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, starred: !f.starred } : f));
    try {
      const item = files.find(f => f.id === id);
      if (item) {
        if (item.type === 'folder') await api.post(`/folders/${id}/star`);
        else await api.post(`/files/${id}/star`);
      }
    } catch (err) {
      console.error(err);
      setFiles(prev => prev.map(f => f.id === id ? { ...f, starred: !f.starred } : f));
    }
  }, [files]);

  const toggleShare = useCallback(async (id) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, shared: !f.shared } : f));
    try {
      const item = files.find(f => f.id === id);
      if (item) {
        let res;
        if (item.type === 'folder') res = await api.post(`/folders/${id}/share`);
        else res = await api.post(`/files/${id}/share`);
        if (res.data) {
          setFiles(prev => prev.map(f => f.id === id ? { ...f, shared: res.data.isPublic, publicLinkToken: res.data.publicLinkToken } : f));
        }
      }
    } catch (err) {
      console.error(err);
      setFiles(prev => prev.map(f => f.id === id ? { ...f, shared: !f.shared } : f));
    }
  }, [files]);

  const moveToTrash = useCallback(async (id) => {
    const item = files.find(f => f.id === id);
    setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'trash' } : f));
    try {
      if (item?.type === 'folder') await api.delete(`/folders/${id}`);
      else await api.delete(`/files/${id}`);
      fetchStorageStats();
    } catch (err) {
      console.error(err);
      if (item) setFiles(prev => prev.map(f => f.id === id ? { ...f, status: item.status } : f));
    }
  }, [files, fetchStorageStats]);

  const restoreItem = useCallback(async (id) => {
    const item = files.find(f => f.id === id);
    setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'active' } : f));
    try {
      if (item?.type === 'folder') await api.post(`/folders/${id}/restore`);
      else await api.post(`/files/${id}/restore`);
      fetchStorageStats();
    } catch (err) {
      console.error(err);
      if (item) setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'trash' } : f));
    }
  }, [files, fetchStorageStats]);

  const deleteItemPermanently = useCallback(async (id) => {
    permanentlyDeletedIds.current.add(id);
    setFiles(prev => prev.filter(f => f.id !== id));
    try {
      const item = files.find(f => f.id === id);
      if (item?.type === 'folder') await api.delete(`/folders/${id}/permanent`);
      else await api.delete(`/files/${id}/permanent`);
      fetchStorageStats();
    } catch (err) {
      console.error(err);
    }
  }, [files, fetchStorageStats]);

  const renameItem = useCallback(async (id, newName, isFolder = false) => {
    const cleanName = newName.trim();
    if (!cleanName) return;
    setFiles(prev => prev.map(f => f.id === id ? { ...f, name: cleanName } : f));
    for (const [key, items] of viewCache.current.entries()) {
      viewCache.current.set(key, items.map(f => f.id === id ? { ...f, name: cleanName } : f));
    }
    try {
      const endpoint = isFolder ? `/folders/${id}/rename` : `/files/${id}/rename`;
      const res = await api.patch(endpoint, { name: cleanName });
      return res.data;
    } catch (err) {
      console.error('renameItem error:', err);
      triggerBackgroundSync();
      throw err;
    }
  }, [triggerBackgroundSync]);

  const moveItem = useCallback(async (id, targetFolderId, isFolder = false) => {
    // 0ms instant UI removal from current view
    setFiles(prev => prev.filter(f => f.id !== id));
    for (const [key, items] of viewCache.current.entries()) {
      viewCache.current.set(key, items.filter(f => f.id !== id));
    }
    try {
      const endpoint = isFolder ? `/folders/${id}/move` : `/files/${id}/move`;
      const payload = isFolder ? { parentId: targetFolderId } : { folderId: targetFolderId };
      const res = await api.patch(endpoint, payload);
      triggerBackgroundSync();
      return res.data;
    } catch (err) {
      console.error('moveItem error:', err);
      triggerBackgroundSync();
      throw err;
    }
  }, [triggerBackgroundSync]);

  const fetchFolderTree = useCallback(async () => {
    try {
      const res = await api.get('/folders/tree/all');
      return res.data.folders || [];
    } catch (err) {
      console.error('fetchFolderTree error:', err);
      return [];
    }
  }, []);

  const fetchFileActivity = useCallback(async (id) => {
    try {
      const res = await api.get(`/files/${id}/activity`);
      return res.data;
    } catch (err) {
      console.error('fetchFileActivity error:', err);
      return null;
    }
  }, []);

  const updateFileContent = useCallback(async (id, name, content) => {
    try {
      const res = await api.patch(`/files/${id}/content`, { name, content });
      setFiles(prev => prev.map(f => f.id === id ? { ...f, name: res.data.name, size: res.data.size } : f));
      for (const [key, items] of viewCache.current.entries()) {
        viewCache.current.set(key, items.map(f => f.id === id ? { ...f, name: res.data.name, size: res.data.size } : f));
      }
      return res.data;
    } catch (err) {
      console.error('updateFileContent error:', err);
      throw new Error(err.response?.data?.message || err.message);
    }
  }, []);

  const downloadFile = useCallback(async (id, name, isFolder = false) => {
    try {
      const url = isFolder ? `/folders/${id}/download` : `/files/download/${id}`;
      const res = await api.get(url, { responseType: 'blob' });
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

  const generatePublicLink = useCallback(async (id, isFolder = false, options = {}) => {
    try {
      const endpoint = isFolder ? `/folders/${id}/public-link` : `/files/${id}/generate-link`;
      const res = await api.post(endpoint, options);
      const token = res.data.publicLinkToken;

      setFiles(prev => prev.map(f => f.id === id ? { ...f, publicLinkToken: token, shared: true } : f));
      for (const [key, items] of viewCache.current.entries()) {
        viewCache.current.set(key, items.map(f => f.id === id ? { ...f, publicLinkToken: token, shared: true } : f));
      }
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
      for (const [key, items] of viewCache.current.entries()) {
        viewCache.current.set(key, items.map(f => f.id === id ? { ...f, publicLinkToken: null, shared: false } : f));
      }
      return res.data;
    } catch (err) {
      console.error(err);
      throw new Error(err.response?.data?.message || err.message);
    }
  }, []);

  const fetchItemShares = useCallback(async (id) => {
    try {
      const res = await api.get(`/shares/item/${id}`);
      return res.data;
    } catch (err) {
      console.error('fetchItemShares error:', err);
      throw new Error(err.response?.data?.message || err.message);
    }
  }, []);

  const revokeItemShare = useCallback(async (shareId) => {
    try {
      const res = await api.delete(`/shares/${shareId}`);
      return res.data;
    } catch (err) {
      console.error('revokeItemShare error:', err);
      throw new Error(err.response?.data?.message || err.message);
    }
  }, []);

  const updateSharePermission = useCallback(async (shareId, permission) => {
    try {
      const res = await api.patch(`/shares/${shareId}`, { permission });
      return res.data;
    } catch (err) {
      console.error('updateSharePermission error:', err);
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
    addOptimisticFolder,
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
    renameItem,
    moveItem,
    fetchFolderTree,
    fetchFileActivity,
    fetchItemShares,
    revokeItemShare,
    updateSharePermission,
    updateFileContent,
  };

  return <FilesContext.Provider value={value}>{children}</FilesContext.Provider>;
}

export { FilesContext };
