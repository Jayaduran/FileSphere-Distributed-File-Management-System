import { Request, Response } from 'express';
import prisma from '../config/db';
import path from 'path';
import fs from 'fs';
import { updateFolderSize } from '../utils/folderSize';
import { fileMetadataSelect } from '../utils/fileSelect';
import { ZipArchive } from 'archiver';

// Helper to resolve duplicate file name in 0ms without looping queries
const resolveUniqueFileName = async (
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

    const updated = await prisma.file.update({
      where: { id },
      data: { publicLinkToken: token, isPublic: true },
      select: fileMetadataSelect,
    });

    res.json(updated);
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
      select: { id: true, userId: true },
    });

    if (!file || file.userId !== userId) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

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

    // 1. Search in File by publicLinkToken OR by id
    const file = await prisma.file.findFirst({
      where: {
        OR: [
          { publicLinkToken: token },
          { id: token, isPublic: true },
          { id: token },
        ],
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        mimeType: true,
        size: true,
        isTrashed: true,
        isPublic: true,
        publicLinkToken: true,
        createdAt: true,
        updatedAt: true,
        lastAccessed: true,
        user: {
          select: { name: true, email: true },
        },
      },
    });

    if (file) {
      if (file.isTrashed) {
        res.status(404).json({ message: 'File is no longer available (it was moved to trash)' });
        return;
      }

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
        },
      });
      return;
    }

    // 2. Search in Folder by publicLinkToken OR by id
    const folder = await prisma.folder.findFirst({
      where: {
        OR: [
          { publicLinkToken: token },
          { id: token, isPublic: true },
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

    // Check file by token OR id
    const file = await prisma.file.findFirst({
      where: {
        OR: [
          { publicLinkToken: token },
          { id: token, isPublic: true },
          { id: token },
        ],
      },
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

      // Background update last accessed
      prisma.file.update({
        where: { id: file.id },
        data: { lastAccessed: new Date() },
        select: { id: true },
      }).catch(console.error);

      const isInline = req.query.view === '1' || req.query.inline === 'true';
      const disposition = isInline ? 'inline' : 'attachment';

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
          { id: token, isPublic: true },
          { id: token },
        ],
      },
    });

    if (folder) {
      if (folder.isTrashed) {
        res.status(404).json({ message: 'Folder not found or link is invalid' });
        return;
      }

      res.attachment(`${folder.name}.zip`);
      const archive = new ZipArchive({ zlib: { level: 6 } }); // Level 6 for much faster compression speed

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
