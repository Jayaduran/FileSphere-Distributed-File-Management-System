import { Router } from 'express';
import { createFolder, getFolderContents, deleteFolder, restoreFolder, toggleStarFolder, toggleShareFolder } from '../controllers/folders';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken); // Protect all folder routes

router.post('/', createFolder);
router.get('/:id', getFolderContents);
router.delete('/:id', deleteFolder);
router.post('/:id/restore', restoreFolder);
router.post('/:id/star', toggleStarFolder);
router.post('/:id/share', toggleShareFolder);

export default router;
