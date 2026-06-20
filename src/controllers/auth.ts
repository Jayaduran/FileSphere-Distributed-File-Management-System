import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

const getDeviceFromUA = (ua: string | undefined): string => {
  if (!ua) return 'Unknown Device';
  const uaLower = ua.toLowerCase();
  if (uaLower.includes('mobi') || uaLower.includes('android') || uaLower.includes('iphone')) {
    if (uaLower.includes('iphone')) return 'iPhone (Mobile)';
    if (uaLower.includes('android')) return 'Android Phone';
    return 'Mobile Device';
  }
  if (uaLower.includes('windows')) return 'Windows PC';
  if (uaLower.includes('macintosh') || uaLower.includes('mac os')) return 'macOS Device';
  if (uaLower.includes('linux')) return 'Linux PC';
  return 'Desktop Device';
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ message: 'User already exists' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'User',
      },
    });

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1d' });

    // Track active session
    const ua = req.headers['user-agent'];
    const device = getDeviceFromUA(ua);
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;

    await prisma.session.create({
      data: {
        token,
        userId: user.id,
        device,
        ipAddress,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    // Set secure cookie
    res.setHeader('Set-Cookie', `token=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    if (!user.password) {
      res.status(401).json({ message: 'This account uses Google login. Please sign in with Google.' });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1d' });

    // Track active session
    const ua = req.headers['user-agent'];
    const device = getDeviceFromUA(ua);
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;

    await prisma.session.create({
      data: {
        token,
        userId: user.id,
        device,
        ipAddress,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    // Set secure cookie
    res.setHeader('Set-Cookie', `token=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        webhookEvents: true,
        emailAlerts: true,
        smsSecurity: true,
        createdAt: true,
      }
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { name, role, webhookEvents, emailAlerts, smsSecurity } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined && { name }),
        ...(role !== undefined && { role }),
        ...(webhookEvents !== undefined && { webhookEvents }),
        ...(emailAlerts !== undefined && { emailAlerts }),
        ...(smsSecurity !== undefined && { smsSecurity }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        webhookEvents: true,
        emailAlerts: true,
        smsSecurity: true,
        createdAt: true,
      }
    });

    res.json({ message: 'Profile updated successfully', user: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const activeToken = (req as any).token;

    const sessions = await prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    const formatted = sessions.map(s => ({
      id: s.id,
      device: s.device,
      deviceIcon: s.device.toLowerCase().includes('phone') || s.device.toLowerCase().includes('mobile') ? 'phone' : 'laptop',
      current: s.token === activeToken,
      detail: `IP: ${s.ipAddress || 'Unknown'} — Active since ${new Date(s.createdAt).toLocaleString()}`
    }));

    res.json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const id = req.params.id as string;

    const session = await prisma.session.findFirst({
      where: { id, userId }
    });

    if (!session) {
      res.status(404).json({ message: 'Session not found' });
      return;
    }

    await prisma.session.delete({ where: { id } });
    res.json({ message: 'Session revoked' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteAllSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const activeToken = (req as any).token;

    await prisma.session.deleteMany({
      where: {
        userId,
        token: { not: activeToken }
      }
    });

    res.json({ message: 'All other sessions revoked successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const googleLogin = async (req: Request, res: Response): Promise<void> => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CALLBACK_URI } = process.env;
  
  if (GOOGLE_CLIENT_ID && GOOGLE_CALLBACK_URI) {
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOOGLE_CALLBACK_URI)}&scope=email%20profile`;
    res.redirect(googleAuthUrl);
  } else {
    res.redirect('http://localhost:5173/mock-google-login');
  }
};

export const googleCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const code = req.query.code as string;
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URI } = process.env;

    if (!code || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALLBACK_URI) {
      res.redirect('http://localhost:5173/login?error=OAuth%20Configuration%20Error');
      return;
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_CALLBACK_URI,
        grant_type: 'authorization_code'
      })
    });

    const tokenData: any = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('Google exchange error:', tokenData);
      res.redirect('http://localhost:5173/login?error=Google%20Exchange%20Error');
      return;
    }

    const userInfoRes = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${tokenData.access_token}`);
    const userInfo: any = await userInfoRes.json();
    if (!userInfoRes.ok) {
      res.redirect('http://localhost:5173/login?error=Google%20User%20Info%20Error');
      return;
    }

    const { email, name } = userInfo;

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: name || email.split('@')[0],
          password: null,
        }
      });
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1d' });

    const ua = req.headers['user-agent'];
    const device = getDeviceFromUA(ua);
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;

    await prisma.session.create({
      data: {
        token,
        userId: user.id,
        device,
        ipAddress,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    res.setHeader('Set-Cookie', `token=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`);

    res.redirect(`http://localhost:5173/login?token=${token}&user=${encodeURIComponent(JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt
    }))}`);
  } catch (error) {
    console.error(error);
    res.redirect('http://localhost:5173/login?error=OAuth%20Internal%20Error');
  }
};

export const mockGoogleCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, name } = req.body;

    if (!email || !name) {
      res.status(400).json({ message: 'Email and name are required' });
      return;
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          password: null,
        }
      });
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1d' });

    const ua = req.headers['user-agent'];
    const device = getDeviceFromUA(ua);
    const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;

    await prisma.session.create({
      data: {
        token,
        userId: user.id,
        device,
        ipAddress,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    res.setHeader('Set-Cookie', `token=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
