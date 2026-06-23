import api from '../services/api';

const CHUNK_SIZE = 1024 * 1024 * 2; // 2MB

export class ChunkUploader {
  constructor(fileBlob, folderId, batchId, onProgress, onStatusChange) {
    this.uploadId = Math.random().toString(36).substr(2, 9);
    this.fileBlob = fileBlob;
    this.folderId = folderId || 'root';
    this.batchId = batchId;
    this.name = fileBlob.name;
    this.totalChunks = Math.ceil(fileBlob.size / CHUNK_SIZE) || 1;
    this.chunkIndex = 0;
    this.progress = 0;
    this.status = 'pending'; // pending, uploading, paused, cancelled, completed, error
    this.controller = null;
    this.dbId = null;

    this.onProgress = onProgress;
    this.onStatusChange = onStatusChange;
  }

  // Called by the queue runner — begins or resumes uploading
  async run() {
    if (this.status === 'cancelled') return;
    this.status = 'uploading';
    this.onStatusChange(this);
    await this._process();
  }

  // Pause the currently active chunk upload
  pause() {
    if (this.status === 'uploading') {
      this.status = 'paused';
      if (this.controller) this.controller.abort();
      this.onStatusChange(this);
    } else if (this.status === 'pending') {
      // Mark as paused before it even starts
      this.status = 'paused';
      this.onStatusChange(this);
    }
  }

  // Resume from paused — queue runner must call run() again
  resume() {
    if (this.status === 'paused') {
      this.status = 'pending';
      this.onStatusChange(this);
      // Actual restart is triggered by the queue
    }
  }

  // Hard cancel — abort XHR and wipe temp chunks on server
  async cancel() {
    const wasUploading = this.status === 'uploading';
    this.status = 'cancelled';
    if (this.controller) this.controller.abort();
    this.onStatusChange(this);
    // Only call server cleanup if we've started sending chunks
    if (wasUploading || this.chunkIndex > 0) {
      try {
        await api.delete(`/files/upload-cancel/${this.uploadId}`);
      } catch (e) {}
    }
  }

  async _process() {
    try {
      // Direct upload fallback for files <= 5MB to optimize network speed
      const DIRECT_UPLOAD_LIMIT = 1024 * 1024 * 5; // 5MB
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
            if (progressEvent.total) {
              this.progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              this.onProgress(this);
            }
          }
        });

        this.dbId = res.data.id;
        this.progress = 100;
        this.status = 'completed';
        this.onStatusChange(this);
        return;
      }

      // Chunked upload logic for larger files
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
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        this.chunkIndex++;
        this.progress = Math.round((this.chunkIndex / this.totalChunks) * 100);
        this.onProgress(this);
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
        this.dbId = res.data.id;
        this.progress = 100;
        this.status = 'completed';
        this.onStatusChange(this);
      }
      // If status changed to paused/cancelled mid-loop, _process just exits cleanly
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
        // Aborted — status already set by pause() or cancel()
      } else {
        this.status = 'error';
        this.onStatusChange(this);
      }
    }
  }
}
