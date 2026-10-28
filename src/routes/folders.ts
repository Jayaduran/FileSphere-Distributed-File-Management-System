import { Router } from 'express';
import {
  createFolder,
  createFolderBatch,
  getFolderContents,
  deleteFolder,
  deleteFolderPermanently,
  restoreFolder,
  toggleStarFolder,
  toggleShareFolder,
  downloadFolder,
  generatePublicLinkFolder,
  revokePublicLinkFolder,
  renameFolder,
  moveFolder,
  getAllFoldersTree,
} from '../controllers/folders';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken); // Protect all folder routes

router.post('/', createFolder);
router.post('/batch', createFolderBatch);
router.get('/tree/all', getAllFoldersTree);
router.get('/:id', getFolderContents);
router.patch('/:id/rename', renameFolder);
router.patch('/:id/move', moveFolder);
router.delete('/:id', deleteFolder);
router.delete('/:id/permanent', deleteFolderPermanently);
router.post('/:id/restore', restoreFolder);
router.post('/:id/star', toggleStarFolder);
router.post('/:id/share', toggleShareFolder);
router.post('/:id/public-link', generatePublicLinkFolder);
router.delete('/:id/public-link', revokePublicLinkFolder);
router.get('/:id/download', downloadFolder);

export default router;
