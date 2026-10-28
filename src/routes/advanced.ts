import { Router } from 'express';
import { 
  getTrash, getStarred, search, getShared, getStorage, getStorageStats, getRecent, 
  shareFileWithUser, getItemShares, revokeShare, updateSharePermission 
} from '../controllers/advanced';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken); // Protect routes

router.get('/trash', getTrash);
router.get('/starred', getStarred);
router.get('/shared', getShared);
router.get('/storage', getStorage);
router.get('/storage-stats', getStorageStats);
router.get('/search', search);
router.get('/recent', getRecent);
router.post('/files/:id/share-with', shareFileWithUser);
router.get('/shares/item/:id', getItemShares);
router.delete('/shares/:shareId', revokeShare);
router.patch('/shares/:shareId', updateSharePermission);

export default router;
