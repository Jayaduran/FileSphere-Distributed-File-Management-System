import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';
import { OAuth2Client } from 'google-auth-library';
import transporter from '../config/mail';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

    await prisma.session.upsert({
      where: { token },
      update: {
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        device,
        ipAddress,
      },
      create: {
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

    await prisma.session.upsert({
      where: { token },
      update: {
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        device,
        ipAddress,
      },
      create: {
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
  const { GOOGLE_CLIENT_ID, GOOGLE_CALLBACK_URI, FRONTEND_ORIGIN } = process.env;
  const frontendOrigin = (FRONTEND_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
  
  if (GOOGLE_CLIENT_ID && GOOGLE_CALLBACK_URI) {
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOOGLE_CALLBACK_URI)}&scope=email%20profile`;
    res.redirect(googleAuthUrl);
  } else {
    res.redirect(`${frontendOrigin}/mock-google-login`);
  }
};

export const googleCallback = async (req: Request, res: Response): Promise<void> => {
  const frontendOrigin = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
  try {
    const code = req.query.code as string;
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URI } = process.env;

    if (!code || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALLBACK_URI) {
      res.redirect(`${frontendOrigin}/login?error=OAuth%20Configuration%20Error`);
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
      res.redirect(`${frontendOrigin}/login?error=Google%20Exchange%20Error`);
      return;
    }

    const userInfoRes = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${tokenData.access_token}`);
    const userInfo: any = await userInfoRes.json();
    if (!userInfoRes.ok) {
      res.redirect(`${frontendOrigin}/login?error=Google%20User%20Info%20Error`);
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

    await prisma.session.upsert({
      where: { token },
      update: {
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        device,
        ipAddress,
      },
      create: {
        token,
        userId: user.id,
        device,
        ipAddress,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    res.setHeader('Set-Cookie', `token=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`);

    res.redirect(`${frontendOrigin}/login?token=${token}&user=${encodeURIComponent(JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt
    }))}`);
  } catch (error) {
    console.error(error);
    res.redirect(`${frontendOrigin}/login?error=OAuth%20Internal%20Error`);
  }
};

export const verifyGoogleToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { credential } = req.body;
    if (!credential) {
      res.status(400).json({ message: 'Token is required' });
      return;
    }

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      res.status(400).json({ message: 'Invalid token' });
      return;
    }

    const { email, name } = payload;
    if (!email) {
      res.status(400).json({ message: 'Email not found in token' });
      return;
    }

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

    await prisma.session.upsert({
      where: { token },
      update: {
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        device,
        ipAddress,
      },
      create: {
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

    await prisma.session.upsert({
      where: { token },
      update: {
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        device,
        ipAddress,
      },
      create: {
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

export const deleteAccount = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    await prisma.user.delete({
      where: { id: userId }
    });

    res.setHeader('Set-Cookie', 'token=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax');
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ message: 'Email is required' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // For security, don't explicitly leak that the email doesn't exist
      res.status(200).json({ message: 'If this email is registered, a password reset link has been sent.' });
      return;
    }

    // Generate JWT token containing the user id, email, and current password hash
    // (so if they reset the password once, the hash changes, invalidating this token immediately)
    const currentPassHash = user.password || 'no-password-oauth';
    const token = jwt.sign(
      { id: user.id, email: user.email, currentPassHash },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const clientUrl = process.env.CLIENT_URL || (req.headers.origin as string) || 'http://localhost:5173';
    const resetUrl = `${clientUrl}/reset-password?token=${token}`;

    console.log("Password reset requested. Reset Link:", resetUrl);

    if (process.env.SMTP_USER) {
      await transporter.sendMail({
        from: `"FileSphere Support" <${process.env.SMTP_USER}>`,
        to: user.email,
        subject: 'Reset your FileSphere Password',
        html: `<p>Hello ${user.name || 'User'},</p>
               <p>We received a request to reset your password for your FileSphere account.</p>
               <p>Click the link below to set a new password. This link will expire in 15 minutes:</p>
               <p><a href="${resetUrl}" style="background:#4F46E5;color:#fff;padding:8px 16px;text-decoration:none;border-radius:4px;display:inline-block;">Reset Password</a></p>
               <p>If you did not request this, please ignore this email.</p>`
      });
    } else {
      console.log("SMTP_USER not configured. Reset Link:", resetUrl);
    }

    res.json({ message: 'If this email is registered, a password reset link has been sent.' });
  } catch (error) {
    console.error('Error in forgotPassword:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      res.status(400).json({ message: 'Token and new password are required' });
      return;
    }

    // Verify token
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      res.status(400).json({ message: 'Invalid or expired reset token' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      res.status(400).json({ message: 'User not found' });
      return;
    }

    // Check if password hash has changed (meaning token already used)
    const currentPassHash = user.password || 'no-password-oauth';
    if (decoded.currentPassHash !== currentPassHash) {
      res.status(400).json({ message: 'This password reset link has already been used' });
      return;
    }

    // Hash the new password and update user record
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    // Delete active sessions to force re-authentication on other devices
    await prisma.session.deleteMany({
      where: { userId: user.id }
    }).catch(() => {});

    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Error in resetPassword:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
