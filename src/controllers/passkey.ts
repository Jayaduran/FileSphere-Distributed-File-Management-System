import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../config/db';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const RP_ID = process.env.RP_ID || 'localhost';
const RP_NAME = process.env.RP_NAME || 'FileSphere';
const ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

// ── Helpers ────────────────────────────────────────────────────────────────

function base64url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function fromBase64url(str: string): Buffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLength), 'base64');
}

function parseAuthData(authData: Buffer) {
  // https://w3c.github.io/webauthn/#sctn-authenticator-data
  const rpIdHash = authData.slice(0, 32);
  const flags = authData[32];
  const signCount = authData.readUInt32BE(33);
  const up = (flags & 0x01) !== 0; // user present
  const uv = (flags & 0x04) !== 0; // user verified
  const at = (flags & 0x40) !== 0; // attested credential data included

  let credentialId: Buffer | null = null;
  let credentialPublicKey: Buffer | null = null;

  if (at && authData.length > 37) {
    // aaguid (16 bytes) starting at offset 37
    const aaguidEnd = 53;
    const credIdLen = authData.readUInt16BE(aaguidEnd);
    const credIdStart = aaguidEnd + 2;
    credentialId = authData.slice(credIdStart, credIdStart + credIdLen);
    credentialPublicKey = authData.slice(credIdStart + credIdLen);
  }

  return { rpIdHash, flags, signCount, up, uv, credentialId, credentialPublicKey };
}

// ── Register Options ────────────────────────────────────────────────────────

export const getRegisterOptions = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    const challenge = base64url(crypto.randomBytes(32));
    const userIdB64 = base64url(Buffer.from(userId));

    // Store challenge (expires in 5 minutes)
    await prisma.passkeyChallenge.create({
      data: {
        userId,
        challenge,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      }
    });

    const existingKeys = await prisma.passkeyCredential.findMany({ where: { userId } });

    res.json({
      challenge,
      rp: { id: RP_ID, name: RP_NAME },
      user: { id: userIdB64, name: user.email, displayName: user.name },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      timeout: 60000,
      attestation: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        requireResidentKey: true,
        residentKey: 'required',
        userVerification: 'preferred',
      },
      excludeCredentials: existingKeys.map(k => ({
        id: k.credentialId,
        type: 'public-key',
      })),
    });
  } catch (error) {
    console.error('getRegisterOptions error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Register Passkey ────────────────────────────────────────────────────────

export const registerPasskey = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { id: credentialId, rawId, response: attestationResponse, deviceName } = req.body;

    if (!credentialId || !attestationResponse) {
      res.status(400).json({ message: 'Missing credential data' });
      return;
    }

    const clientDataJSON = JSON.parse(
      Buffer.from(fromBase64url(attestationResponse.clientDataJSON)).toString('utf8')
    );

    // Verify challenge
    const challengeRecord = await prisma.passkeyChallenge.findFirst({
      where: {
        userId,
        challenge: clientDataJSON.challenge,
        expiresAt: { gte: new Date() },
      }
    });

    if (!challengeRecord) {
      res.status(400).json({ message: 'Invalid or expired challenge' });
      return;
    }

    // Verify origin
    if (clientDataJSON.origin !== ORIGIN) {
      res.status(400).json({ message: 'Origin mismatch' });
      return;
    }

    // Parse authenticator data
    const authDataBuf = fromBase64url(attestationResponse.authenticatorData);
    const parsed = parseAuthData(authDataBuf);

    // Verify rpIdHash
    const expectedRpIdHash = crypto.createHash('sha256').update(RP_ID).digest();
    if (!parsed.rpIdHash.equals(expectedRpIdHash)) {
      res.status(400).json({ message: 'RP ID mismatch' });
      return;
    }

    if (!parsed.up) {
      res.status(400).json({ message: 'User presence not verified' });
      return;
    }

    if (!parsed.credentialPublicKey || !parsed.credentialId) {
      res.status(400).json({ message: 'No credential in authenticator data' });
      return;
    }

    // Save credential
    await prisma.passkeyCredential.create({
      data: {
        userId,
        credentialId,
        publicKey: base64url(parsed.credentialPublicKey),
        counter: parsed.signCount,
        deviceName: deviceName || 'Passkey Device',
      }
    });

    // Clean up challenge
    await prisma.passkeyChallenge.delete({ where: { id: challengeRecord.id } });

    res.json({ message: 'Passkey registered successfully' });
  } catch (error) {
    console.error('registerPasskey error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Auth Options (Login) ────────────────────────────────────────────────────

export const getAuthOptions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    const challenge = base64url(crypto.randomBytes(32));

    let userId: string | undefined;
    let allowCredentials: any[] = [];

    if (email) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        userId = user.id;
        const keys = await prisma.passkeyCredential.findMany({ where: { userId: user.id } });
        allowCredentials = keys.map(k => ({ id: k.credentialId, type: 'public-key' }));
      }
    }

    await prisma.passkeyChallenge.create({
      data: {
        userId: userId || null,
        email: email || null,
        challenge,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      }
    });

    res.json({
      challenge,
      timeout: 60000,
      rpId: RP_ID,
      allowCredentials,
      userVerification: 'preferred',
    });
  } catch (error) {
    console.error('getAuthOptions error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Verify Passkey (Login) ──────────────────────────────────────────────────

export const verifyPasskey = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id: credentialId, response: assertionResponse } = req.body;

    if (!credentialId || !assertionResponse) {
      res.status(400).json({ message: 'Missing credential data' });
      return;
    }

    // Look up the credential
    const credential = await prisma.passkeyCredential.findUnique({ where: { credentialId } });
    if (!credential) {
      res.status(401).json({ message: 'Passkey not found. Please register first.' });
      return;
    }

    // Parse clientDataJSON
    const clientDataJSON = JSON.parse(
      Buffer.from(fromBase64url(assertionResponse.clientDataJSON)).toString('utf8')
    );

    // Verify challenge
    const challengeRecord = await prisma.passkeyChallenge.findFirst({
      where: {
        challenge: clientDataJSON.challenge,
        expiresAt: { gte: new Date() },
      }
    });

    if (!challengeRecord) {
      res.status(400).json({ message: 'Invalid or expired challenge' });
      return;
    }

    // Verify origin
    if (clientDataJSON.origin !== ORIGIN) {
      res.status(400).json({ message: 'Origin mismatch' });
      return;
    }

    // Parse auth data
    const authDataBuf = fromBase64url(assertionResponse.authenticatorData);
    const parsed = parseAuthData(authDataBuf);

    // Verify rpIdHash
    const expectedRpIdHash = crypto.createHash('sha256').update(RP_ID).digest();
    if (!parsed.rpIdHash.equals(expectedRpIdHash)) {
      res.status(400).json({ message: 'RP ID mismatch' });
      return;
    }

    if (!parsed.up) {
      res.status(400).json({ message: 'User presence not verified' });
      return;
    }

    // Update counter (replay attack prevention)
    if (parsed.signCount > 0 && parsed.signCount <= credential.counter) {
      res.status(400).json({ message: 'Replay attack detected' });
      return;
    }

    await prisma.passkeyCredential.update({
      where: { credentialId },
      data: { counter: parsed.signCount },
    });

    // Clean up challenge
    await prisma.passkeyChallenge.delete({ where: { id: challengeRecord.id } });

    // Issue JWT
    const user = await prisma.user.findUnique({ where: { id: credential.userId } });
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1d' });

    const ua = req.headers['user-agent'] || '';
    const device = ua.includes('Mobile') ? 'Mobile Device' : 'Desktop (Passkey)';
    const ipAddress = req.ip || '';

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
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }
    });

    res.setHeader('Set-Cookie', `token=${token}; Path=/; HttpOnly; Max-Age=86400; SameSite=Lax`);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      }
    });
  } catch (error) {
    console.error('verifyPasskey error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
