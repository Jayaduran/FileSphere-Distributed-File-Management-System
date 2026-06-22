import { Request, Response } from 'express';
import prisma from '../config/db';
import path from 'path';
import fs from 'fs';
import { updateFolderSize } from '../utils/folderSize';
import { ZipArchive } from 'archiver';

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

    // Auto-rename if a file with the same name already exists
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    let finalName = file.originalname;
    let counter = 1;

    while (true) {
      const existing = await prisma.file.findFirst({
        where: { name: finalName, folderId: parsedFolderId, userId },
      });
      if (!existing) break;
      finalName = `${baseName} (${counter})${ext}`;
      counter++;
    }

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
    });

    if (parsedFolderId) {
      await updateFolderSize(parsedFolderId, file.size);
    }

    res.status(201).json(dbFile);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const downloadFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({ where: { id } });

    if (!file) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    if (file.userId !== userId && !file.isPublic) {
      const share = await prisma.fileShare.findUnique({
        where: { fileId_userId: { fileId: id, userId } }
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

    await prisma.file.update({
      where: { id },
      data: { lastAccessed: new Date() },
    });

    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.send(file.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({ where: { id } });

    if (!file || file.userId !== userId) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    // Soft delete instead of hard delete
    await prisma.file.update({
      where: { id },
      data: { isTrashed: true },
    });

    if (file.folderId) {
      await updateFolderSize(file.folderId, -file.size);
    }

    res.json({ message: 'File moved to trash' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteFilePermanently = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({ where: { id } });

    if (!file || file.userId !== userId) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    await prisma.file.delete({
      where: { id },
    });

    res.json({ message: 'File deleted permanently' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const restoreFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({ where: { id } });

    if (!file || file.userId !== userId) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    await prisma.file.update({
      where: { id },
      data: { isTrashed: false },
    });

    if (file.folderId) {
      await updateFolderSize(file.folderId, file.size);
    }

    res.json({ message: 'File restored' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const toggleStarFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({ where: { id } });

    if (!file || file.userId !== userId) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    const updated = await prisma.file.update({
      where: { id },
      data: { isStarred: !file.isStarred },
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const toggleShareFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({ where: { id } });

    if (!file || file.userId !== userId) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    const updated = await prisma.file.update({
      where: { id },
      data: { isPublic: !file.isPublic },
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const publicDownload = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    const file = await prisma.file.findUnique({ where: { id } });

    if (!file || !file.isPublic || file.isTrashed) {
      res.status(404).json({ message: 'File not found or not public' });
      return;
    }

    if (!file.data) {
      res.status(404).json({ message: 'File data not found in database' });
      return;
    }

    await prisma.file.update({
      where: { id },
      data: { lastAccessed: new Date() },
    });

    res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.send(file.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const generatePublicLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({ where: { id } });

    if (!file || file.userId !== userId) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    const token = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);

    const updated = await prisma.file.update({
      where: { id },
      data: { publicLinkToken: token, isPublic: true },
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const revokePublicLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({ where: { id } });

    if (!file || file.userId !== userId) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    const updated = await prisma.file.update({
      where: { id },
      data: { publicLinkToken: null, isPublic: false },
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const publicTokenDownload = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.params.token as string;

    const file = await prisma.file.findUnique({ where: { publicLinkToken: token } });

    if (file) {
      if (file.isTrashed) {
        res.status(404).json({ message: 'File not found or link is invalid' });
        return;
      }
      if (!file.data) {
        res.status(404).json({ message: 'File data not found in database' });
        return;
      }

      await prisma.file.update({
        where: { id: file.id },
        data: { lastAccessed: new Date() },
      });

      res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
      res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
      res.send(file.data);
      return;
    }

    const folder = await prisma.folder.findUnique({ where: { publicLinkToken: token } });
    
    if (folder) {
      if (folder.isTrashed) {
        res.status(404).json({ message: 'Folder not found or link is invalid' });
        return;
      }

      res.attachment(`${folder.name}.zip`);
      const archive = new ZipArchive({ zlib: { level: 9 } });

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
    console.error(error);
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
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, uploadId);
    fs.appendFileSync(tempFilePath, chunk.buffer);

    res.json({ message: 'Chunk uploaded' });
  } catch (error) {
    console.error(error);
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

    const fileBuffer = fs.readFileSync(tempFilePath);
    const parsedFolderId = folderId && folderId !== 'root' ? folderId : null;

    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    let finalName = originalName;
    let counter = 1;

    while (true) {
      const existing = await prisma.file.findFirst({
        where: { name: finalName, folderId: parsedFolderId, userId },
      });
      if (!existing) break;
      finalName = `${baseName} (${counter})${ext}`;
      counter++;
    }

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
    });

    if (parsedFolderId) {
      await updateFolderSize(parsedFolderId, Number(size));
    }

    fs.unlinkSync(tempFilePath);
    res.status(201).json(dbFile);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const uploadCancel = async (req: Request, res: Response): Promise<void> => {
  try {
    const uploadId = req.params.uploadId as string;
    const tempFilePath = path.join(__dirname, '../../uploads/temp', uploadId);
    
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    res.json({ message: 'Upload cancelled' });
  } catch (error) {
    console.error(error);
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
      const file = await prisma.file.findUnique({ where: { id } });
      if (file && file.userId === userId) {
        await prisma.file.delete({ where: { id } });
        if (file.folderId) {
          await updateFolderSize(file.folderId, -file.size);
        }
      }
    }
    res.json({ message: 'Batch reverted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
