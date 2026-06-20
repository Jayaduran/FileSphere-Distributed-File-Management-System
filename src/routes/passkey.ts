import { Router } from 'express';
import { getRegisterOptions, registerPasskey, getAuthOptions, verifyPasskey } from '../controllers/passkey';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Registration (requires existing session/token)
router.post('/register-options', authenticateToken, getRegisterOptions);
router.post('/register', authenticateToken, registerPasskey);

// Authentication (no session needed — this IS the login)
router.post('/auth-options', getAuthOptions);
router.post('/auth', verifyPasskey);

export default router;
