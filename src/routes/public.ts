import { Router } from 'express';
import { publicDownload, publicTokenDownload } from '../controllers/files';

const router = Router();

// Publicly accessible, no auth required
router.get('/files/:id/download', publicDownload);
router.get('/files/link/:token', publicTokenDownload);

export default router;
