import { Router } from 'express';
import { uploadFile, downloadFile, deleteFile, restoreFile, toggleStarFile, toggleShareFile } from '../controllers/files';
import { authenticateToken } from '../middleware/auth';
import { upload } from '../config/multer';

const router = Router();

router.use(authenticateToken); // Protect all file routes

router.post('/upload', upload.single('file'), uploadFile);
router.get('/download/:id', downloadFile);
router.delete('/:id', deleteFile);
router.post('/:id/restore', restoreFile);
router.post('/:id/star', toggleStarFile);
router.post('/:id/share', toggleShareFile);

export default router;
