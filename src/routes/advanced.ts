import { Router } from 'express';
import { getTrash, getStarred, search, getShared, getStorage } from '../controllers/advanced';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken); // Protect routes

router.get('/trash', getTrash);
router.get('/starred', getStarred);
router.get('/shared', getShared);
router.get('/storage', getStorage);
router.get('/search', search);

export default router;
