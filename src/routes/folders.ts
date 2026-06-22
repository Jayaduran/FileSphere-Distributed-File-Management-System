import { Router } from 'express';
import { createFolder, getFolderContents, deleteFolder, deleteFolderPermanently, restoreFolder, toggleStarFolder, toggleShareFolder, downloadFolder, generatePublicLinkFolder, revokePublicLinkFolder } from '../controllers/folders';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken); // Protect all folder routes

router.post('/', createFolder);
router.get('/:id', getFolderContents);
router.delete('/:id', deleteFolder);
router.delete('/:id/permanent', deleteFolderPermanently);
router.post('/:id/restore', restoreFolder);
router.post('/:id/star', toggleStarFolder);
router.post('/:id/share', toggleShareFolder);
router.post('/:id/public-link', generatePublicLinkFolder);
router.delete('/:id/public-link', revokePublicLinkFolder);
router.get('/:id/download', downloadFolder);

export default router;
