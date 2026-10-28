import { Router } from 'express';
import { publicDownload, publicTokenDownload, getPublicItemInfo } from '../controllers/files';

const router = Router();

// Publicly accessible, no auth required
router.get('/files/:id/download', publicDownload);
router.get('/files/link/:token', publicTokenDownload);
router.get('/files/link/:token/info', getPublicItemInfo);
router.get('/share/:token', getPublicItemInfo);
router.get('/share/:token/download', publicTokenDownload);

export default router;
