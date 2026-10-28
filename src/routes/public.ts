import { Router } from 'express';
import { publicDownload, publicTokenDownload, getPublicItemInfo } from '../controllers/files';

const router = Router();

// Publicly accessible, no auth required
router.get('/files/:id/download', publicDownload);
router.get('/files/link/:token', publicTokenDownload);
router.get('/files/link/:token/info', getPublicItemInfo);
router.get('/share/:token', getPublicItemInfo);
router.get('/share/:token/info', getPublicItemInfo);
router.get('/share/:token/download', publicTokenDownload);
router.get('/:token/info', getPublicItemInfo);
router.get('/:token/download', publicTokenDownload);
router.get('/:token', (req, res, next) => {
  if (req.query.download === '1' || req.query.download === 'true') {
    return publicTokenDownload(req, res);
  }
  return getPublicItemInfo(req, res);
});

export default router;
