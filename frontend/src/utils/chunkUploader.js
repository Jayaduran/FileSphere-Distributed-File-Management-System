import api from '../services/api';

const CHUNK_SIZE = 1024 * 1024 * 8; // 8MB per chunk
const DIRECT_UPLOAD_LIMIT = 1024 * 1024 * 50; // 50MB direct high-speed upload

export class ChunkUploader {
  constructor(fileBlob, folderId, batchId, onProgress, onStatusChange) {
    this.uploadId = Math.random().toString(36).substr(2, 9);
    this.fileBlob = fileBlob;
    this.folderId = folderId || 'root';
    this.batchId = batchId;
    this.name = fileBlob.name;
    this.totalChunks = fileBlob.size <= DIRECT_UPLOAD_LIMIT ? 1 : Math.ceil(fileBlob.size / CHUNK_SIZE) || 1;
    this.chunkIndex = 0;
    this.progress = 0;
    this.status = 'pending'; // pending, uploading, paused, cancelled, completed, error
    this.controller = null;
    this.dbId = null;
    this.uploadedFile = null;

    this.onProgress = onProgress;
    this.onStatusChange = onStatusChange;
    this._lastProgressTime = 0;
  }

  // Throttle progress updates to at most once per 80ms to keep main thread completely unblocked (60fps)
  _reportProgress(newPercent) {
    const clamped = Math.min(99, Math.max(0, newPercent));
    const now = Date.now();
    if (clamped !== this.progress && (now - this._lastProgressTime > 80 || clamped === 99 || clamped === 0)) {
      this._lastProgressTime = now;
      this.progress = clamped;
      if (this.onProgress) {
        this.onProgress(this);
      }
    }
  }

  // Called by the queue runner — begins or resumes uploading
  async run() {
    if (this.status === 'cancelled' || this.status === 'paused') return;
    this.status = 'uploading';
    this.onStatusChange(this);
    await this._process();
  }

  // Pause the currently active chunk upload immediately
  pause() {
    if (this.status === 'uploading' || this.status === 'pending') {
      this.status = 'paused';
      if (this.controller) {
        try { this.controller.abort(); } catch (e) {}
      }
      this.onStatusChange(this);
    }
  }

  // Resume from paused
  resume() {
    if (this.status === 'paused') {
      this.status = 'pending';
      this.onStatusChange(this);
    }
  }

  // Hard cancel — abort immediately and wipe temp chunks on server
  async cancel() {
    const wasUploading = this.status === 'uploading';
    this.status = 'cancelled';
    if (this.controller) {
      try { this.controller.abort(); } catch (e) {}
    }
    this.onStatusChange(this);

    // Call server cleanup in background if chunks were sent
    if (wasUploading || this.chunkIndex > 0) {
      api.delete(`/files/upload-cancel/${this.uploadId}`).catch(() => {});
    }
  }

  async _process() {
    try {
      // Direct upload for files <= 50MB to maximize network speed and reduce roundtrips
      if (this.fileBlob.size <= DIRECT_UPLOAD_LIMIT) {
        const formData = new FormData();
        formData.append('file', this.fileBlob, this.name);
        if (this.folderId && this.folderId !== 'root') {
          formData.append('folderId', this.folderId);
        }

        this.controller = new AbortController();

        const res = await api.post('/files/upload', formData, {
          signal: this.controller.signal,
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            if (this.status !== 'uploading') return;
            if (progressEvent.total) {
              const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              this._reportProgress(pct);
            }
          }
        });

        if (this.status === 'cancelled' || this.status === 'paused') return;

        this.uploadedFile = res.data;
        this.dbId = res.data.id;
        this.progress = 100;
        this.status = 'completed';
        this.onStatusChange(this);
        return;
      }

      // Chunked upload logic for larger files (> 50MB)
      while (this.chunkIndex < this.totalChunks && this.status === 'uploading') {
        const start = this.chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, this.fileBlob.size);
        const chunkBlob = this.fileBlob.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', chunkBlob, this.name);
        formData.append('uploadId', this.uploadId);

        this.controller = new AbortController();

        await api.post('/files/upload-chunk', formData, {
          signal: this.controller.signal,
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            if (this.status !== 'uploading') return;
            if (progressEvent.total) {
              const chunkProgress = progressEvent.loaded / progressEvent.total;
              const overallPercent = Math.round(((this.chunkIndex + chunkProgress) / this.totalChunks) * 100);
              this._reportProgress(overallPercent);
            }
          }
        });

        if (this.status !== 'uploading') return;

        this.chunkIndex++;
        const overallPercent = Math.round((this.chunkIndex / this.totalChunks) * 100);
        this._reportProgress(overallPercent);
      }

      // All chunks sent and still in uploading state — finalize
      if (this.status === 'uploading' && this.chunkIndex === this.totalChunks) {
        const finishData = {
          uploadId: this.uploadId,
          originalName: this.name,
          mimeType: this.fileBlob.type,
          size: this.fileBlob.size,
          folderId: this.folderId
        };
        const res = await api.post('/files/upload-finish', finishData);
        if (this.status === 'cancelled' || this.status === 'paused') return;
        this.uploadedFile = res.data;
        this.dbId = res.data.id;
        this.progress = 100;
        this.status = 'completed';
        this.onStatusChange(this);
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
        // Aborted cleanly by pause() or cancel()
      } else {
        if (this.status === 'uploading') {
          this.status = 'error';
          this.onStatusChange(this);
        }
      }
    }
  }
}
