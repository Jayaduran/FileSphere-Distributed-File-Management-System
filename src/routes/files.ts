import { Router } from 'express';
import { uploadFile, downloadFile, deleteFile, deleteFilePermanently, restoreFile, toggleStarFile, toggleShareFile, generatePublicLink, revokePublicLink, uploadChunk, uploadFinish, uploadCancel, batchRevert } from '../controllers/files';
import { authenticateToken } from '../middleware/auth';
import { upload } from '../config/multer';

const router = Router();

router.use(authenticateToken); // Protect all file routes

router.post('/upload', upload.single('file'), uploadFile);
router.post('/upload-chunk', upload.single('chunk'), uploadChunk);
router.post('/upload-finish', uploadFinish);
router.delete('/upload-cancel/:uploadId', uploadCancel);
router.post('/batch-revert', batchRevert);
router.get('/download/:id', downloadFile);
router.delete('/:id', deleteFile);
router.delete('/:id/permanent', deleteFilePermanently);
router.post('/:id/restore', restoreFile);
router.post('/:id/star', toggleStarFile);
router.post('/:id/share', toggleShareFile);
router.post('/:id/generate-link', generatePublicLink);
router.post('/:id/revoke-link', revokePublicLink);

export default router;
