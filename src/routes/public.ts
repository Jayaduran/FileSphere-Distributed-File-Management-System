import { Router } from 'express';
import { publicDownload } from '../controllers/files';

const router = Router();

// Publicly accessible, no auth required
router.get('/files/:id/download', publicDownload);

export default router;
