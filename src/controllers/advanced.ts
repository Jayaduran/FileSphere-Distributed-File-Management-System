import { Request, Response } from 'express';
import prisma from '../config/db';
import nodemailer from 'nodemailer';

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.SMTP_PORT || '587'),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const getTrashedFolderIds = async (userId: string): Promise<Set<string>> => {
  const folders = await prisma.folder.findMany({
    where: { userId }
  });

  const folderMap = new Map<string, { parentId: string | null; isTrashed: boolean }>();
  folders.forEach(f => {
    folderMap.set(f.id, { parentId: f.parentId, isTrashed: f.isTrashed });
  });

  const trashedIds = new Set<string>();

  const isAncestorTrashed = (folderId: string | null): boolean => {
    let currentId = folderId;
    while (currentId) {
      const node = folderMap.get(currentId);
      if (!node) break;
      if (node.isTrashed) return true;
      currentId = node.parentId;
    }
    return false;
  };

  folders.forEach(f => {
    if (f.isTrashed || isAncestorTrashed(f.parentId)) {
      trashedIds.add(f.id);
    }
  });

  return trashedIds;
};

export const getTrash = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    const folders = await prisma.folder.findMany({
      where: { userId, isTrashed: true },
    });

    const files = await prisma.file.findMany({
      where: { userId, isTrashed: true },
    });

    res.json({ folders, files });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getStarred = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const trashedFolderIds = await getTrashedFolderIds(userId);

    const folders = await prisma.folder.findMany({
      where: { userId, isStarred: true, isTrashed: false },
    });

    const files = await prisma.file.findMany({
      where: { userId, isStarred: true, isTrashed: false },
    });

    const filteredFolders = folders.filter(f => !trashedFolderIds.has(f.id));
    const filteredFiles = files.filter(f => !f.folderId || !trashedFolderIds.has(f.folderId));

    res.json({ folders: filteredFolders, files: filteredFiles });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const search = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const query = req.query.q as string;

    if (!query) {
      res.status(400).json({ message: 'Query parameter "q" is required' });
      return;
    }

    const trashedFolderIds = await getTrashedFolderIds(userId);

    const folders = await prisma.folder.findMany({
      where: {
        userId,
        isTrashed: false,
        name: { contains: query },
      },
      include: { parent: { select: { name: true } } }
    });

    const files = await prisma.file.findMany({
      where: {
        userId,
        isTrashed: false,
        name: { contains: query },
      },
      include: { folder: { select: { name: true } } }
    });

    const filteredFolders = folders.filter(f => !trashedFolderIds.has(f.id));
    const filteredFiles = files.filter(f => !f.folderId || !trashedFolderIds.has(f.folderId));

    res.json({ folders: filteredFolders, files: filteredFiles });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getShared = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const trashedFolderIds = await getTrashedFolderIds(userId);

    // Folders that are public
    const folders = await prisma.folder.findMany({
      where: { userId, isPublic: true, isTrashed: false },
    });

    // Files that are public OR shared specifically with this user
    const publicFiles = await prisma.file.findMany({
      where: { userId, isPublic: true, isTrashed: false },
    });

    const sharedWithMe = await prisma.fileShare.findMany({
      where: { userId },
      include: { file: true }
    });

    // Extract files from shares and filter out trashed ones
    const sharedFiles = sharedWithMe.map(share => share.file).filter(file => !file.isTrashed);

    // Combine and deduplicate
    const allFilesMap = new Map();
    [...publicFiles, ...sharedFiles].forEach(f => allFilesMap.set(f.id, f));
    const files = Array.from(allFilesMap.values());

    const filteredFolders = folders.filter(f => !trashedFolderIds.has(f.id));
    const filteredFiles = files.filter(f => !f.folderId || !trashedFolderIds.has(f.folderId));

    res.json({ folders: filteredFolders, files: filteredFiles });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getStorage = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const trashedFolderIds = await getTrashedFolderIds(userId);

    const files = await prisma.file.findMany({
      where: { userId, isTrashed: false },
      orderBy: { size: 'desc' }
    });

    const filteredFiles = files.filter(f => !f.folderId || !trashedFolderIds.has(f.folderId));

    res.json({ folders: [], files: filteredFiles });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getStorageStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const trashedFolderIds = await getTrashedFolderIds(userId);

    // Fetch all active files for user
    const files = await prisma.file.findMany({
      where: { userId, isTrashed: false },
      select: { size: true, mimeType: true, folderId: true }
    });

    const filteredFiles = files.filter(f => !f.folderId || !trashedFolderIds.has(f.folderId));

    let images = 0, imagesCount = 0;
    let videos = 0, videosCount = 0;
    let documents = 0, documentsCount = 0;
    let other = 0, otherCount = 0;

    let totalBytes = 0;

    filteredFiles.forEach(f => {
      const s = f.size || 0;
      totalBytes += s;
      const type = f.mimeType || '';

      if (type.startsWith('image/')) {
        images += s;
        imagesCount++;
      } else if (type.startsWith('video/')) {
        videos += s;
        videosCount++;
      } else if (type.includes('pdf') || type.includes('document') || type.includes('text')) {
        documents += s;
        documentsCount++;
      } else {
        other += s;
        otherCount++;
      }
    });

    const breakdown = [
      { label: 'Images', size: images, count: imagesCount, color: '#007BFF' },
      { label: 'Videos', size: videos, count: videosCount, color: '#28A745' },
      { label: 'Documents', size: documents, count: documentsCount, color: '#FFC107' },
      { label: 'Other', size: other, count: otherCount, color: '#6C757D' }
    ].filter(item => item.count > 0);

    res.json({
      usedBytes: totalBytes,
      limitBytes: 10 * 1024 * 1024 * 1024, // 10GB limit
      breakdown
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getRecent = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const trashedFolderIds = await getTrashedFolderIds(userId);

    const files = await prisma.file.findMany({
      where: { userId, isTrashed: false },
      orderBy: { lastAccessed: 'desc' },
      include: { folder: { select: { name: true } } }
    });

    const filteredFiles = files
      .filter(f => !f.folderId || !trashedFolderIds.has(f.folderId))
      .slice(0, 20);

    res.json({ folders: [], files: filteredFiles });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const shareFileWithUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const fileId = req.params.id as string;
    const { email, permission } = req.body;
    const sharedById = (req as any).user.id;

    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.userId !== sharedById) {
      res.status(404).json({ message: 'File not found or unauthorized' });
      return;
    }

    const targetUser = await prisma.user.findUnique({ where: { email } });
    if (!targetUser) {
      res.status(404).json({ message: 'User with this email not found' });
      return;
    }

    const fileShare = await prisma.fileShare.upsert({
      where: {
        fileId_userId: { fileId, userId: targetUser.id }
      },
      update: {
        permission: permission || 'VIEW'
      },
      create: {
        fileId,
        userId: targetUser.id,
        sharedById,
        permission: permission || 'VIEW'
      }
    });

    // Send email notification
    if (process.env.SMTP_USER) {
      try {
        await transporter.sendMail({
          from: `"FileSphere" <${process.env.SMTP_USER}>`,
          to: email,
          subject: `A file has been shared with you on FileSphere`,
          html: `<p>Hello ${targetUser.name},</p>
                 <p>User <b>${(req as any).user.id}</b> has shared the file <b>${file.name}</b> with you.</p>
                 <p>Permission granted: <b>${permission || 'VIEW'}</b></p>
                 <p><a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/shared">Click here to view your shared files</a></p>`
        });
      } catch (emailErr) {
        console.error('Failed to send email:', emailErr);
      }
    }

    res.json({ message: 'File shared successfully', fileShare });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
