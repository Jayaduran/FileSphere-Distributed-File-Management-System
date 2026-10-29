import { Router } from 'express';
import {
  publicDownload,
  publicTokenDownload,
  getPublicItemInfo,
  updatePublicFileContent,
} from '../controllers/files';

const router = Router();

// Publicly accessible, no auth required (optional auth handled in controller)
router.get('/files/:id/download', publicDownload);
router.get('/files/link/:token', publicTokenDownload);
router.get('/files/link/:token/info', getPublicItemInfo);
router.patch('/files/link/:token/content', updatePublicFileContent);
router.patch('/files/:token/content', updatePublicFileContent);
router.get('/share/:token', getPublicItemInfo);
router.get('/share/:token/info', getPublicItemInfo);
router.patch('/share/:token/content', updatePublicFileContent);
router.get('/share/:token/download', publicTokenDownload);
router.get('/:token/info', getPublicItemInfo);
router.patch('/:token/content', updatePublicFileContent);
router.get('/:token/download', publicTokenDownload);
router.get('/:token', (req, res, next) => {
  if (req.query.download === '1' || req.query.download === 'true') {
    return publicTokenDownload(req, res);
  }
  return getPublicItemInfo(req, res);
});

export default router;
