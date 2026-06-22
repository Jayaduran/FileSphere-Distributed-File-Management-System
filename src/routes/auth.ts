import { Router } from 'express';
import {
  register,
  login,
  getProfile,
  updateProfile,
  getSessions,
  deleteSession,
  deleteAllSessions,
  googleLogin,
  googleCallback,
  mockGoogleCallback,
  verifyGoogleToken,
  deleteAccount
} from '../controllers/auth';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);

// Profile
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfile);
router.delete('/profile', authenticateToken, deleteAccount);

// Sessions
router.get('/sessions', authenticateToken, getSessions);
router.delete('/sessions/:id', authenticateToken, deleteSession);
router.delete('/sessions', authenticateToken, deleteAllSessions);

// Google OAuth
router.get('/google', googleLogin);
router.get('/google/callback', googleCallback);
router.post('/google/verify', verifyGoogleToken);
router.post('/google/mock-callback', mockGoogleCallback);

export default router;
