import { Request, Response } from 'express';
import prisma from '../config/db';
import path from 'path';
import fs from 'fs';
import { updateFolderSize } from '../utils/folderSize';
import { fileMetadataSelect } from '../utils/fileSelect';
import { ZipArchive } from 'archiver';
import { setPublicLinkOptions, getPublicLinkOptions, deletePublicLinkOptions } from '../utils/publicLinkStore';
import { recordAccess, getAccessHistoryForFile } from '../utils/accessHistoryStore';
import jwt from 'jsonwebtoken';

export function getOptionalAuthUser(req: Request): { id: string; email?: string; name?: string } | null {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
      if (decoded && decoded.id) {
        return decoded;
      }
    }
    const queryToken = (req.query.token as string) || (req.query.auth_token as string);
    if (queryToken && queryToken.length > 30) {
      const decoded = jwt.verify(queryToken, process.env.JWT_SECRET || 'your-secret-key') as any;
      if (decoded && decoded.id) {
        return decoded;
      }
    }
  } catch (e) {
    // Ignore invalid or expired token
  }
  return null;
}

// Helper to resolve duplicate file name in 0ms without looping queries
export const resolveUniqueFileName = async (
  originalName: string,
  folderId: string | null,
  userId: string
): Promise<string> => {
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext);

  // Single fast check for exact match
  const existing = await prisma.file.findFirst({
    where: { name: originalName, folderId, userId },
    select: { id: true },
  });

  if (!existing) {
    return originalName;
  }

  // If collision, query all matching prefixes in one single DB roundtrip
  const matches = await prisma.file.findMany({
    where: {
      userId,
      folderId,
      name: { startsWith: baseName },
    },
    select: { name: true },
  });

  const existingNames = new Set(matches.map((m) => m.name));
  let counter = 1;
  let candidate = `${baseName} (${counter})${ext}`;
  while (existingNames.has(candidate)) {
    counter++;
    candidate = `${baseName} (${counter})${ext}`;
  }

  return candidate;
};

export const uploadFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    const { folderId } = req.body;
    const userId = (req as any).user.id;

    if (!file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }

    const parsedFolderId = folderId && folderId !== 'root' ? folderId : null;

    // Fast O(1) duplicate name resolution
    const finalName = await resolveUniqueFileName(file.originalname, parsedFolderId, userId);

    const dbFile = await prisma.file.create({
      data: {
        name: finalName,
        originalName: finalName,
        mimeType: file.mimetype,
        size: file.size,
        data: file.buffer,
        folderId: parsedFolderId,
        userId,
      },
      select: fileMetadataSelect,
    });

    // Run folder size update in background so HTTP response is instant (< 50ms)
    if (parsedFolderId) {
      updateFolderSize(parsedFolderId, file.size).catch((err) => {
        console.error('Background folder size update error:', err);
      });
    }

    res.status(201).json(dbFile);
  } catch (error) {
    console.error('uploadFile error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const downloadFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        isPublic: true,
        isTrashed: true,
        originalName: true,
        name: true,
        mimeType: true,
        size: true,
        data: true,
      },
    });

    if (!file) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    if (file.userId !== userId && !file.isPublic) {
      const share = await prisma.fileShare.findUnique({
        where: { fileId_userId: { fileId: id, userId } },
      });
      if (!share) {
        res.status(404).json({ message: 'File not found or access denied' });
        return;
      }
    }

    if (file.isTrashed) {
      res.status(400).json({ message: 'File is in trash' });
      return;
    }

    if (!file.data) {
      res.status(404).json({ message: 'File data not found in database' });
      return;
    }

    // Background update last accessed without blocking
    prisma.file.update({
      where: { id },
      data: { lastAccessed: new Date() },
      select: { id: true },
    }).catch(console.error);

    const isInline = req.query.view === '1' || req.query.inline === 'true';

    recordAccess({
      fileId: id,
      action: isInline ? 'VIEW' : 'DOWNLOAD',
      actor: (req as any).user?.name || (req as any).user?.email || 'User',
      actorEmail: (req as any).user?.email,
      isOwner: file.userId === userId,
      ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '',
      userAgent: (req.headers['user-agent'] as string) || '',
    });
    const disposition = isInline ? 'inline' : 'attachment';

    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(file.originalName || file.name)}"`);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', file.size || file.data.length);
    res.send(file.data);
  } catch (error) {
    console.error('downloadFile error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({
      where: { id },
      select: { id: true, userId: true, size: true, folderId: true },
    });

    if (!file || file.userId !== userId) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    // Soft delete
    await prisma.file.update({
      where: { id },
      data: { isTrashed: true },
      select: { id: true },
    });

    if (file.folderId) {
      updateFolderSize(file.folderId, -file.size).catch(console.error);
    }

    res.json({ message: 'File moved to trash' });
  } catch (error) {
    console.error('deleteFile error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteFilePermanently = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!file || file.userId !== userId) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    await prisma.file.delete({
      where: { id },
      select: { id: true },
    });

    res.json({ message: 'File deleted permanently' });
  } catch (error) {
    console.error('deleteFilePermanently error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const restoreFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({
      where: { id },
      select: { id: true, userId: true, size: true, folderId: true },
    });

    if (!file || file.userId !== userId) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    await prisma.file.update({
      where: { id },
      data: { isTrashed: false },
      select: { id: true },
    });

    if (file.folderId) {
      updateFolderSize(file.folderId, file.size).catch(console.error);
    }

    res.json({ message: 'File restored' });
  } catch (error) {
    console.error('restoreFile error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const toggleStarFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({
      where: { id },
      select: { id: true, userId: true, isStarred: true },
    });

    if (!file || file.userId !== userId) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    const updated = await prisma.file.update({
      where: { id },
      data: { isStarred: !file.isStarred },
      select: fileMetadataSelect,
    });

    res.json(updated);
  } catch (error) {
    console.error('toggleStarFile error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const toggleShareFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({
      where: { id },
      select: { id: true, userId: true, isPublic: true, publicLinkToken: true },
    });

    if (!file || file.userId !== userId) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    const nextPublic = !file.isPublic;
    // Auto-generate token if made public so a link always exists immediately
    const token = nextPublic && !file.publicLinkToken
      ? Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10)
      : file.publicLinkToken;

    const updated = await prisma.file.update({
      where: { id },
      data: { isPublic: nextPublic, publicLinkToken: token },
      select: fileMetadataSelect,
    });

    res.json(updated);
  } catch (error) {
    console.error('toggleShareFile error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const publicDownload = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const file = await prisma.file.findUnique({
      where: { id },
      select: {
        id: true,
        isPublic: true,
        isTrashed: true,
        originalName: true,
        name: true,
        mimeType: true,
        size: true,
        data: true,
      },
    });

    if (!file || !file.isPublic || file.isTrashed) {
      res.status(404).json({ message: 'File not found or not public' });
      return;
    }

    if (!file.data) {
      res.status(404).json({ message: 'File data not found in database' });
      return;
    }

    prisma.file.update({
      where: { id },
      data: { lastAccessed: new Date() },
      select: { id: true },
    }).catch(console.error);

    const isInline = req.query.view === '1' || req.query.inline === 'true';
    const disposition = isInline ? 'inline' : 'attachment';

    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(file.originalName || file.name)}"`);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', file.size || file.data.length);
    res.send(file.data);
  } catch (error) {
    console.error('publicDownload error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Ultra-fast link generation in < 5ms (only selects metadata, no Buffer conversion)
export const generatePublicLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({
      where: { id },
      select: { id: true, userId: true, publicLinkToken: true, isPublic: true },
    });

    if (!file || file.userId !== userId) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    // Reuse existing token if present or create a clean 16-char token
    const token = file.publicLinkToken || (Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10));
    const { allowDownload, permission } = req.body || {};

    const updated = await prisma.file.update({
      where: { id },
      data: { publicLinkToken: token, isPublic: true },
      select: fileMetadataSelect,
    });

    setPublicLinkOptions(token, { allowDownload, permission });
    setPublicLinkOptions(id, { allowDownload, permission });

    res.json({ ...updated, allowDownload, permission });
  } catch (error) {
    console.error('generatePublicLink error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const revokePublicLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({
      where: { id },
      select: { id: true, userId: true, publicLinkToken: true },
    });

    if (!file || file.userId !== userId) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    if (file.publicLinkToken) {
      deletePublicLinkOptions(file.publicLinkToken);
    }
    deletePublicLinkOptions(id);

    const updated = await prisma.file.update({
      where: { id },
      data: { publicLinkToken: null, isPublic: false },
      select: fileMetadataSelect,
    });

    res.json(updated);
  } catch (error) {
    console.error('revokePublicLink error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get public item info without streaming bytes (used by PublicSharePage for instant preview)
export const getPublicItemInfo = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawToken = req.params.token as string;
    if (!rawToken) {
      res.status(400).json({ message: 'Token is required' });
      return;
    }

    let token = rawToken.trim();
    if (token.includes('/share/')) {
      token = token.split('/share/').pop()?.split('?')[0].split('/')[0] || token;
    } else if (token.includes('/link/')) {
      token = token.split('/link/').pop()?.split('?')[0].split('/')[0] || token;
    }
    token = token.replace(/\/+$/, '').trim();

    const authUser = getOptionalAuthUser(req);

    // 1. Search in File by publicLinkToken OR by id
    const file = await prisma.file.findFirst({
      where: {
        OR: [
          { publicLinkToken: token },
          { id: token },
        ],
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        mimeType: true,
        size: true,
        folderId: true,
        isTrashed: true,
        isPublic: true,
        publicLinkToken: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
        lastAccessed: true,
        user: {
          select: { id: true, name: true, email: true },
        },
        shares: {
          select: {
            id: true,
            userId: true,
            permission: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (file) {
      if (file.isTrashed) {
        res.status(404).json({ message: 'File is no longer available (it was moved to trash)' });
        return;
      }

      const isOwner = Boolean(authUser && authUser.id === file.userId);
      const shareRecord = authUser ? file.shares.find(s => s.userId === authUser.id) : null;
      const isCollaborator = Boolean(shareRecord);

      // Enforce restricted access check
      if (!file.isPublic && !isOwner && !isCollaborator) {
        res.status(403).json({
          restricted: true,
          message: 'This file is restricted. Access is only allowed for invited collaborators.',
          name: file.originalName || file.name,
          owner: file.user?.name || 'File Owner',
        });
        return;
      }

      let options = getPublicLinkOptions(file.publicLinkToken || file.id);
      if (options.allowDownload && file.folderId) {
        const parentFolder = await prisma.folder.findUnique({
          where: { id: file.folderId },
          select: { publicLinkToken: true },
        });
        if (parentFolder?.publicLinkToken) {
          const parentOpts = getPublicLinkOptions(parentFolder.publicLinkToken);
          if (parentOpts.allowDownload === false) {
            options = { ...options, allowDownload: false };
          }
        }
      }

      let effectivePermission = 'VIEW';
      let effectiveAllowDownload = options.allowDownload !== false;

      if (isOwner) {
        effectivePermission = 'EDIT';
        effectiveAllowDownload = true;
      } else if (isCollaborator) {
        effectivePermission = shareRecord?.permission || 'VIEW';
        effectiveAllowDownload = true;
      } else {
        effectivePermission = options.permission || 'VIEW';
      }

      recordAccess({
        fileId: file.id,
        action: 'OPEN',
        actor: authUser?.name || authUser?.email || `Public Guest (${req.ip || 'web'})`,
        actorEmail: authUser?.email,
        isOwner,
        ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '',
        userAgent: (req.headers['user-agent'] as string) || '',
      });

      res.json({
        type: 'file',
        item: {
          id: file.id,
          name: file.originalName || file.name,
          mimeType: file.mimeType,
          size: file.size,
          token: file.publicLinkToken || file.id,
          createdAt: file.createdAt,
          owner: file.user?.name || 'FileSphere User',
          downloadUrl: `/api/public/files/link/${file.publicLinkToken || file.id}`,
          previewUrl: `/api/public/files/link/${file.publicLinkToken || file.id}?view=1`,
          allowDownload: effectiveAllowDownload,
          permission: effectivePermission,
          isRestricted: !file.isPublic,
          isOwner,
        },
      });
      return;
    }

    // 2. Search in Folder by publicLinkToken OR by id
    const folder = await prisma.folder.findFirst({
      where: {
        OR: [
          { publicLinkToken: token },
          { id: token },
        ],
      },
      include: {
        user: { select: { name: true, email: true } },
        files: {
          where: { isTrashed: false },
          select: {
            id: true,
            name: true,
            originalName: true,
            mimeType: true,
            size: true,
            createdAt: true,
          },
        },
        children: {
          where: { isTrashed: false },
          select: {
            id: true,
            name: true,
            size: true,
            createdAt: true,
          },
        },
      },
    });

    if (folder) {
      if (folder.isTrashed) {
        res.status(404).json({ message: 'Folder is no longer available (it was moved to trash)' });
        return;
      }

      const isOwner = Boolean(authUser && authUser.id === folder.userId);

      // Enforce restricted access check
      if (!folder.isPublic && !isOwner) {
        res.status(403).json({
          restricted: true,
          message: 'This folder is restricted. Access is only allowed for invited collaborators.',
          name: folder.name,
          owner: folder.user?.name || 'Folder Owner',
        });
        return;
      }

      const options = getPublicLinkOptions(folder.publicLinkToken || folder.id);
      const effectivePermission = isOwner ? 'EDIT' : (options.permission || 'VIEW');
      const effectiveAllowDownload = isOwner ? true : (options.allowDownload !== false);

      res.json({
        type: 'folder',
        item: {
          id: folder.id,
          name: folder.name,
          size: folder.size,
          token: folder.publicLinkToken || folder.id,
          createdAt: folder.createdAt,
          owner: folder.user?.name || 'FileSphere User',
          files: folder.files,
          subfolders: folder.children,
          downloadUrl: `/api/public/files/link/${folder.publicLinkToken || folder.id}`,
          allowDownload: effectiveAllowDownload,
          permission: effectivePermission,
          isRestricted: !folder.isPublic,
          isOwner,
        },
      });
      return;
    }

    res.status(404).json({ message: 'File or folder not found or link is invalid' });
  } catch (error) {
    console.error('getPublicItemInfo error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const publicTokenDownload = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawToken = req.params.token as string;
    if (!rawToken) {
      res.status(400).json({ message: 'Token is required' });
      return;
    }

    let token = rawToken.trim();
    if (token.includes('/share/')) {
      token = token.split('/share/').pop()?.split('?')[0].split('/')[0] || token;
    } else if (token.includes('/link/')) {
      token = token.split('/link/').pop()?.split('?')[0].split('/')[0] || token;
    }
    token = token.replace(/\/+$/, '').trim();

    const authUser = getOptionalAuthUser(req);

    // Check file by token OR id
    const file = await prisma.file.findFirst({
      where: {
        OR: [
          { publicLinkToken: token },
          { id: token },
        ],
      },
      include: {
        shares: {
          select: { userId: true, permission: true }
        }
      }
    });

    if (file) {
      if (file.isTrashed) {
        res.status(404).json({ message: 'File not found or link is invalid' });
        return;
      }
      if (!file.data) {
        res.status(404).json({ message: 'File data not found in database' });
        return;
      }

      const isOwner = Boolean(authUser && authUser.id === file.userId);
      const isCollaborator = Boolean(authUser && file.shares.some(s => s.userId === authUser.id));

      if (!file.isPublic && !isOwner && !isCollaborator) {
        res.status(403).json({ message: 'Access denied. This file is restricted to invited collaborators.', restricted: true });
        return;
      }

      const isInline = req.query.view === '1' || req.query.inline === 'true';
      let options = getPublicLinkOptions(file.publicLinkToken || file.id);

      if (options.allowDownload && file.folderId) {
        const parentFolder = await prisma.folder.findUnique({
          where: { id: file.folderId },
          select: { publicLinkToken: true },
        });
        if (parentFolder?.publicLinkToken) {
          const parentOpts = getPublicLinkOptions(parentFolder.publicLinkToken);
          if (parentOpts.allowDownload === false) {
            options = { ...options, allowDownload: false };
          }
        }
      }

      if (!isInline && !isOwner && !isCollaborator && options.allowDownload === false) {
        res.status(403).json({ message: 'Direct downloads are disabled for this public link by the owner.' });
        return;
      }

      // Background update last accessed
      prisma.file.update({
        where: { id: file.id },
        data: { lastAccessed: new Date() },
        select: { id: true },
      }).catch(console.error);

      const disposition = isInline ? 'inline' : 'attachment';

      recordAccess({
        fileId: file.id,
        action: isInline ? 'VIEW' : 'DOWNLOAD',
        actor: authUser?.name || authUser?.email || `Public Guest (${req.ip || 'link'})`,
        actorEmail: authUser?.email,
        isOwner,
        ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '',
        userAgent: (req.headers['user-agent'] as string) || '',
      });

      res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(file.originalName || file.name)}"`);
      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', file.size || file.data.length);
      res.send(file.data);
      return;
    }

    // Check folder by token OR id
    const folder = await prisma.folder.findFirst({
      where: {
        OR: [
          { publicLinkToken: token },
          { id: token },
        ],
      },
    });

    if (folder) {
      if (folder.isTrashed) {
        res.status(404).json({ message: 'Folder not found or link is invalid' });
        return;
      }

      const isOwner = Boolean(authUser && authUser.id === folder.userId);
      if (!folder.isPublic && !isOwner) {
        res.status(403).json({ message: 'Access denied. This folder is restricted to invited collaborators.', restricted: true });
        return;
      }

      const folderOptions = getPublicLinkOptions(folder.publicLinkToken || folder.id);
      if (!isOwner && folderOptions.allowDownload === false) {
        res.status(403).json({ message: 'Folder downloads are disabled for this public link by the owner.' });
        return;
      }

      res.attachment(`${folder.name}.zip`);
      const archive = new ZipArchive({ zlib: { level: 6 } });

      archive.on('error', (err: any) => {
        console.error(err);
        if (!res.headersSent) res.status(500).end();
      });

      archive.pipe(res);

      const appendFolderToArchive = async (currentFolderId: string, currentPath: string) => {
        const subfolders = await prisma.folder.findMany({ where: { parentId: currentFolderId, isTrashed: false } });
        const files = await prisma.file.findMany({ where: { folderId: currentFolderId, isTrashed: false } });

        for (const f of files) {
          if (f.data) {
            archive.append(f.data, { name: path.join(currentPath, f.originalName) });
          }
        }
        for (const sub of subfolders) {
          await appendFolderToArchive(sub.id, path.join(currentPath, sub.name));
        }
      };

      await appendFolderToArchive(folder.id, '');
      archive.finalize();
      return;
    }

    res.status(404).json({ message: 'File or folder not found or link is invalid' });
  } catch (error) {
    console.error('publicTokenDownload error:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
};

export const updatePublicFileContent = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawToken = (req.params.token || req.params.id) as string;
    if (!rawToken || typeof rawToken !== 'string') {
      res.status(400).json({ message: 'Token or file ID is required' });
      return;
    }

    let token = rawToken.trim();
    if (token.includes('/share/')) {
      token = token.split('/share/').pop()?.split('?')[0].split('/')[0] || token;
    } else if (token.includes('/link/')) {
      token = token.split('/link/').pop()?.split('?')[0].split('/')[0] || token;
    }
    token = token.replace(/\/+$/, '').trim();

    const authUser = getOptionalAuthUser(req);
    const { content, name } = req.body;

    const file = await prisma.file.findFirst({
      where: {
        OR: [
          { publicLinkToken: token },
          { id: token },
        ],
      },
      include: {
        shares: { select: { userId: true, permission: true } },
      },
    });

    if (!file) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    let canEdit = false;
    const isOwner = Boolean(authUser && authUser.id === file.userId);
    if (isOwner) {
      canEdit = true;
    } else if (authUser && file.shares.some(s => s.userId === authUser.id && s.permission === 'EDIT')) {
      canEdit = true;
    } else if (file.isPublic) {
      const options = getPublicLinkOptions(file.publicLinkToken || file.id);
      if (options.permission === 'EDIT') {
        canEdit = true;
      }
    }

    if (!canEdit) {
      res.status(403).json({ message: 'You do not have permission to edit this file.' });
      return;
    }

    const updateData: any = {};
    if (typeof name === 'string' && name.trim()) {
      updateData.name = name.trim();
      updateData.originalName = name.trim();
    }
    if (typeof content === 'string') {
      const buffer = Buffer.from(content, 'utf-8');
      updateData.data = buffer;
      updateData.size = buffer.length;
    }

    const updated = await prisma.file.update({
      where: { id: file.id },
      data: updateData,
      select: fileMetadataSelect,
    });

    recordAccess({
      fileId: file.id,
      action: 'EDIT',
      actor: authUser?.name || authUser?.email || `Collaborator (${req.ip || 'web'})`,
      actorEmail: authUser?.email,
      isOwner,
      ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '',
      userAgent: (req.headers['user-agent'] as string) || '',
    });

    res.json(updated);
  } catch (error) {
    console.error('updatePublicFileContent error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const uploadChunk = async (req: Request, res: Response): Promise<void> => {
  try {
    const chunk = req.file;
    const { uploadId } = req.body;

    if (!chunk || !uploadId) {
      res.status(400).json({ message: 'Missing chunk or uploadId' });
      return;
    }

    const tempDir = path.join(__dirname, '../../uploads/temp');
    if (!fs.existsSync(tempDir)) {
      await fs.promises.mkdir(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, uploadId);
    await fs.promises.appendFile(tempFilePath, chunk.buffer);

    res.json({ message: 'Chunk uploaded' });
  } catch (error) {
    console.error('uploadChunk error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const uploadFinish = async (req: Request, res: Response): Promise<void> => {
  try {
    const { uploadId, originalName, mimeType, size, folderId } = req.body;
    const userId = (req as any).user.id;

    if (!uploadId || !originalName || !size) {
      res.status(400).json({ message: 'Missing required fields' });
      return;
    }

    const tempFilePath = path.join(__dirname, '../../uploads/temp', uploadId);
    if (!fs.existsSync(tempFilePath)) {
      res.status(404).json({ message: 'Temp file not found' });
      return;
    }

    const fileBuffer = await fs.promises.readFile(tempFilePath);
    const parsedFolderId = folderId && folderId !== 'root' ? folderId : null;

    // Fast O(1) duplicate naming resolution
    const finalName = await resolveUniqueFileName(originalName, parsedFolderId, userId);

    const dbFile = await prisma.file.create({
      data: {
        name: finalName,
        originalName: finalName,
        mimeType: mimeType || 'application/octet-stream',
        size: Number(size),
        data: fileBuffer,
        folderId: parsedFolderId,
        userId,
      },
      select: fileMetadataSelect,
    });

    if (parsedFolderId) {
      updateFolderSize(parsedFolderId, Number(size)).catch(console.error);
    }

    await fs.promises.unlink(tempFilePath).catch(() => {});
    res.status(201).json(dbFile);
  } catch (error) {
    console.error('uploadFinish error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const uploadCancel = async (req: Request, res: Response): Promise<void> => {
  try {
    const uploadId = req.params.uploadId as string;
    const tempFilePath = path.join(__dirname, '../../uploads/temp', uploadId);

    if (fs.existsSync(tempFilePath)) {
      await fs.promises.unlink(tempFilePath).catch(() => {});
    }
    res.json({ message: 'Upload cancelled' });
  } catch (error) {
    console.error('uploadCancel error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const batchRevert = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileIds } = req.body;
    const userId = (req as any).user.id;

    if (!fileIds || !Array.isArray(fileIds)) {
      res.status(400).json({ message: 'Invalid fileIds' });
      return;
    }

    for (const id of fileIds) {
      const file = await prisma.file.findUnique({
        where: { id },
        select: { id: true, userId: true, size: true, folderId: true },
      });
      if (file && file.userId === userId) {
        await prisma.file.delete({ where: { id }, select: { id: true } });
        if (file.folderId) {
          updateFolderSize(file.folderId, -file.size).catch(console.error);
        }
      }
    }
    res.json({ message: 'Batch reverted' });
  } catch (error) {
    console.error('batchRevert error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const renameFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { name } = req.body;
    const userId = (req as any).user.id;

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ message: 'Valid name is required' });
      return;
    }

    const file = await prisma.file.findUnique({
      where: { id },
      select: { id: true, userId: true, isPublic: true, publicLinkToken: true, folderId: true },
    });

    if (!file) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    let canEdit = file.userId === userId;
    if (!canEdit) {
      if (file.isPublic && file.publicLinkToken) {
        const publicOpts = getPublicLinkOptions(file.publicLinkToken);
        if (publicOpts.permission === 'EDIT') canEdit = true;
      }
      if (!canEdit && file.folderId) {
        const parentFolder = await prisma.folder.findUnique({
          where: { id: file.folderId },
          select: { isPublic: true, publicLinkToken: true },
        });
        if (parentFolder?.isPublic && parentFolder.publicLinkToken) {
          const folderOpts = getPublicLinkOptions(parentFolder.publicLinkToken);
          if (folderOpts.permission === 'EDIT') canEdit = true;
        }
      }
      if (!canEdit) {
        const share = await prisma.fileShare.findFirst({
          where: { fileId: id, userId, permission: 'EDIT' },
        });
        if (share) canEdit = true;
      }
    }

    if (!canEdit) {
      res.status(403).json({ message: 'Unauthorized to edit this file' });
      return;
    }

    const updated = await prisma.file.update({
      where: { id },
      data: { name: name.trim(), originalName: name.trim() },
      select: fileMetadataSelect,
    });

    res.json(updated);
  } catch (error) {
    console.error('renameFile error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateFileContent = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { content, name } = req.body;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({
      where: { id },
      select: { id: true, userId: true, isPublic: true, publicLinkToken: true, folderId: true },
    });

    if (!file) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    let canEdit = file.userId === userId;
    if (!canEdit) {
      if (file.isPublic && file.publicLinkToken) {
        const publicOpts = getPublicLinkOptions(file.publicLinkToken);
        if (publicOpts.permission === 'EDIT') canEdit = true;
      }
      if (!canEdit && file.folderId) {
        const parentFolder = await prisma.folder.findUnique({
          where: { id: file.folderId },
          select: { isPublic: true, publicLinkToken: true },
        });
        if (parentFolder?.isPublic && parentFolder.publicLinkToken) {
          const folderOpts = getPublicLinkOptions(parentFolder.publicLinkToken);
          if (folderOpts.permission === 'EDIT') canEdit = true;
        }
      }
      if (!canEdit) {
        const share = await prisma.fileShare.findFirst({
          where: { fileId: id, userId, permission: 'EDIT' },
        });
        if (share) canEdit = true;
      }
    }

    if (!canEdit) {
      res.status(403).json({ message: 'Unauthorized to edit this file' });
      return;
    }

    const updateData: any = {};
    if (typeof name === 'string' && name.trim()) {
      updateData.name = name.trim();
      updateData.originalName = name.trim();
    }
    if (typeof content === 'string') {
      const buffer = Buffer.from(content, 'utf-8');
      updateData.data = buffer;
      updateData.size = buffer.length;
    }

    const updated = await prisma.file.update({
      where: { id },
      data: updateData,
      select: fileMetadataSelect,
    });

    recordAccess({
      fileId: id,
      action: 'EDIT',
      actor: (req as any).user?.name || (req as any).user?.email || 'User',
      actorEmail: (req as any).user?.email,
      isOwner: canEdit,
      ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '',
      userAgent: (req.headers['user-agent'] as string) || '',
    });

    res.json(updated);
  } catch (error) {
    console.error('updateFileContent error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const moveFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { folderId } = req.body;
    const userId = (req as any).user.id;

    const targetFolderId = !folderId || folderId === 'root' ? null : folderId;

    const file = await prisma.file.findUnique({
      where: { id },
      select: { id: true, userId: true, size: true, folderId: true },
    });

    if (!file || file.userId !== userId) {
      res.status(404).json({ message: 'File not found or unauthorized' });
      return;
    }

    if (targetFolderId) {
      const folder = await prisma.folder.findUnique({
        where: { id: targetFolderId },
        select: { id: true, userId: true },
      });
      if (!folder || folder.userId !== userId) {
        res.status(404).json({ message: 'Target folder not found or unauthorized' });
        return;
      }
    }

    const oldFolderId = file.folderId;

    const updated = await prisma.file.update({
      where: { id },
      data: { folderId: targetFolderId },
      select: fileMetadataSelect,
    });

    if (oldFolderId) updateFolderSize(oldFolderId, -file.size).catch(console.error);
    if (targetFolderId) updateFolderSize(targetFolderId, file.size).catch(console.error);

    res.json(updated);
  } catch (error) {
    console.error('moveFile error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getFileActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({
      where: { id },
      include: {
        shares: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            sharedBy: { select: { id: true, name: true, email: true } },
          },
        },
        user: { select: { id: true, name: true, email: true } },
        folder: { select: { id: true, name: true } },
      },
    });

    if (!file) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    const isOwner = file.userId === userId;
    const isShared = file.shares.some(s => s.userId === userId);
    if (!isOwner && !isShared && !file.isPublic) {
      res.status(403).json({ message: 'Unauthorized' });
      return;
    }

    const activities = [];

    activities.push({
      id: `created-${file.id}`,
      type: 'CREATED',
      title: 'File Created',
      description: `${file.name} was uploaded by ${file.user.name || file.user.email}`,
      timestamp: file.createdAt,
      actor: file.user.name || file.user.email,
    });

    if (file.isPublic) {
      activities.push({
        id: `public-${file.id}`,
        type: 'PUBLIC_LINK',
        title: 'Public Link Enabled',
        description: 'File was made accessible to anyone with the link',
        timestamp: file.updatedAt,
        actor: file.user.name || file.user.email,
      });
    }

    file.shares.forEach(s => {
      activities.push({
        id: `share-${s.id}`,
        type: 'SHARED',
        title: `Shared with ${s.user.name || s.user.email}`,
        description: `Permission: ${s.permission} access granted by ${s.sharedBy.name || s.sharedBy.email}`,
        timestamp: s.createdAt,
        actor: s.sharedBy.name || s.sharedBy.email,
        recipient: s.user.name || s.user.email,
        permission: s.permission,
      });
    });

    if (file.lastAccessed && file.lastAccessed > file.createdAt) {
      activities.push({
        id: `accessed-${file.id}`,
        type: 'ACCESSED',
        title: 'File Accessed',
        description: `Viewed or downloaded via FileSphere`,
        timestamp: file.lastAccessed,
        actor: 'User / Link Viewer',
      });
    }

    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const openHistory = isOwner ? getAccessHistoryForFile(file.id) : [];

    res.json({
      file: {
        id: file.id,
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
        isPublic: file.isPublic,
        publicLinkToken: file.publicLinkToken,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        lastAccessed: file.lastAccessed,
        folderName: file.folder?.name || 'My Files',
        owner: file.user.name || file.user.email,
      },
      shares: file.shares,
      activities,
      openHistory,
      isOwner,
    });
  } catch (error) {
    console.error('getFileActivity error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getFileOpenHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!file || file.userId !== userId) {
      res.status(403).json({ message: 'Only file owner can view open history' });
      return;
    }

    const history = getAccessHistoryForFile(id);
    res.json(history);
  } catch (error) {
    console.error('getFileOpenHistory error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
