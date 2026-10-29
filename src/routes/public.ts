import { Router } from 'express';
import {
  publicDownload,
  publicTokenDownload,
  getPublicItemInfo,
  updatePublicFileContent,
} from '../controllers/files';
import {
  publicFolderUpload,
  publicFolderCreateFolder,
} from '../controllers/folders';
import { upload } from '../config/multer';

const router = Router();

// Publicly accessible, no auth required (optional auth handled in controller)
router.get('/files/:id/download', publicDownload);
router.get('/files/link/:token', publicTokenDownload);
router.get('/files/link/:token/info', getPublicItemInfo);
router.patch('/files/link/:token/content', updatePublicFileContent);
router.patch('/files/:token/content', updatePublicFileContent);

// Public folder content management (add files and folders to public share folder)
router.post('/folders/link/:token/upload', upload.single('file'), publicFolderUpload);
router.post('/folders/:token/upload', upload.single('file'), publicFolderUpload);
router.post('/folders/link/:token/create-folder', publicFolderCreateFolder);
router.post('/folders/:token/create-folder', publicFolderCreateFolder);
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
