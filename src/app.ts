import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import folderRoutes from './routes/folders';
import fileRoutes from './routes/files';
import advancedRoutes from './routes/advanced';
import publicRoutes from './routes/public';
import passkeyRoutes from './routes/passkey';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Public routes (NO AUTH REQUIRED by default)
app.use('/api/public', publicRoutes);
app.use('/public', publicRoutes);
app.use('/share', publicRoutes);

// Protected Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth/passkey', passkeyRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/files', fileRoutes);
app.use('/api', advancedRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error Handling Middleware
app.use(errorHandler);

export default app;
