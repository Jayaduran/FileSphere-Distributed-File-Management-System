import { Request, Response } from 'express';
import prisma from '../config/db';
import transporter from '../config/mail';
import { fileMetadataSelect } from '../utils/fileSelect';

const getTrashedFolderIds = async (userId: string): Promise<Set<string>> => {
  const trashedFolders = await prisma.folder.findMany({
    where: { userId, isTrashed: true },
    select: { id: true }
  });

  if (trashedFolders.length === 0) {
    return new Set<string>();
  }

  const allFolders = await prisma.folder.findMany({
    where: { userId },
    select: { id: true, parentId: true, isTrashed: true }
  });

  const folderMap = new Map<string, { parentId: string | null; isTrashed: boolean }>();
  allFolders.forEach(f => {
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

  allFolders.forEach(f => {
    if (f.isTrashed || isAncestorTrashed(f.parentId)) {
      trashedIds.add(f.id);
    }
  });

  return trashedIds;
};

export const getTrash = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    // Parallel execution for instant response (< 10ms)
    const [folders, files] = await Promise.all([
      prisma.folder.findMany({
        where: { userId, isTrashed: true },
      }),
      prisma.file.findMany({
        where: { userId, isTrashed: true },
        select: fileMetadataSelect,
      }),
    ]);

    res.json({ folders, files });
  } catch (error) {
    console.error('getTrash error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getStarred = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    // Parallel execution
    const [trashedFolderIds, folders, files] = await Promise.all([
      getTrashedFolderIds(userId),
      prisma.folder.findMany({
        where: { userId, isStarred: true, isTrashed: false },
      }),
      prisma.file.findMany({
        where: { userId, isStarred: true, isTrashed: false },
        select: fileMetadataSelect,
      }),
    ]);

    const filteredFolders = folders.filter(f => !trashedFolderIds.has(f.id));
    const filteredFiles = files.filter(f => !f.folderId || !trashedFolderIds.has(f.folderId));

    res.json({ folders: filteredFolders, files: filteredFiles });
  } catch (error) {
    console.error('getStarred error:', error);
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

    const [trashedFolderIds, folders, files] = await Promise.all([
      getTrashedFolderIds(userId),
      prisma.folder.findMany({
        where: {
          userId,
          isTrashed: false,
          name: { contains: query },
        },
        include: { parent: { select: { name: true } } },
      }),
      prisma.file.findMany({
        where: {
          userId,
          isTrashed: false,
          name: { contains: query },
        },
        select: {
          ...fileMetadataSelect,
          folder: { select: { name: true } },
        },
      }),
    ]);

    const filteredFolders = folders.filter(f => !trashedFolderIds.has(f.id));
    const filteredFiles = files.filter(f => !f.folderId || !trashedFolderIds.has(f.folderId));

    res.json({ folders: filteredFolders, files: filteredFiles });
  } catch (error) {
    console.error('search error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getShared = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    // Parallelize all 4 queries simultaneously
    const [trashedFolderIds, folders, publicFiles, sharedWithMe] = await Promise.all([
      getTrashedFolderIds(userId),
      prisma.folder.findMany({
        where: { userId, isPublic: true, isTrashed: false },
      }),
      prisma.file.findMany({
        where: { userId, isPublic: true, isTrashed: false },
        select: fileMetadataSelect,
      }),
      prisma.fileShare.findMany({
        where: { userId },
        include: {
          file: {
            select: fileMetadataSelect,
          },
          sharedBy: {
            select: { name: true, email: true },
          },
        },
      }),
    ]);

    const sharedFiles = sharedWithMe
      .filter(share => !share.file.isTrashed)
      .map(share => ({
        ...share.file,
        sharedBy: share.sharedBy.name || share.sharedBy.email,
        permission: share.permission,
      }));

    const allFilesMap = new Map();
    publicFiles.forEach(f => allFilesMap.set(f.id, { ...f, sharedBy: null, permission: null }));
    sharedFiles.forEach(f => allFilesMap.set(f.id, f));
    const files = Array.from(allFilesMap.values());

    const filteredFolders = folders.filter(f => !trashedFolderIds.has(f.id));
    const filteredFiles = files.filter(f => !f.folderId || !trashedFolderIds.has(f.folderId));

    res.json({ folders: filteredFolders, files: filteredFiles });
  } catch (error) {
    console.error('getShared error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getStorage = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    const [trashedFolderIds, files] = await Promise.all([
      getTrashedFolderIds(userId),
      prisma.file.findMany({
        where: { userId, isTrashed: false },
        select: fileMetadataSelect,
        orderBy: { size: 'desc' },
      }),
    ]);

    const filteredFiles = files.filter(f => !f.folderId || !trashedFolderIds.has(f.folderId));

    res.json({ folders: [], files: filteredFiles });
  } catch (error) {
    console.error('getStorage error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getStorageStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    const [trashedFolderIds, files] = await Promise.all([
      getTrashedFolderIds(userId),
      prisma.file.findMany({
        where: { userId, isTrashed: false },
        select: { size: true, mimeType: true, folderId: true },
      }),
    ]);

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
      { label: 'Other', size: other, count: otherCount, color: '#6C757D' },
    ].filter(item => item.count > 0);

    res.json({
      usedBytes: totalBytes,
      limitBytes: 10 * 1024 * 1024 * 1024,
      breakdown,
    });
  } catch (error) {
    console.error('getStorageStats error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getRecent = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    const [trashedFolderIds, files] = await Promise.all([
      getTrashedFolderIds(userId),
      prisma.file.findMany({
        where: { userId, isTrashed: false },
        select: {
          ...fileMetadataSelect,
          folder: { select: { name: true } },
        },
        orderBy: { lastAccessed: 'desc' },
        take: 50,
      }),
    ]);

    const filteredFiles = files
      .filter(f => !f.folderId || !trashedFolderIds.has(f.folderId))
      .slice(0, 20);

    res.json({ folders: [], files: filteredFiles });
  } catch (error) {
    console.error('getRecent error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const shareFileWithUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const fileId = req.params.id as string;
    const { email, permission } = req.body;
    const sharedById = (req as any).user.id;

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: { id: true, name: true, userId: true },
    });

    if (!file || file.userId !== sharedById) {
      res.status(404).json({ message: 'File not found or unauthorized' });
      return;
    }

    const targetUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });

    if (!targetUser) {
      res.status(404).json({ message: 'User with this email not found' });
      return;
    }

    const sharingUser = await prisma.user.findUnique({
      where: { id: sharedById },
      select: { name: true, email: true },
    });

    const sharingUserIdentifier = sharingUser ? `${sharingUser.name} (${sharingUser.email})` : 'A user';

    const fileShare = await prisma.fileShare.upsert({
      where: {
        fileId_userId: { fileId, userId: targetUser.id },
      },
      update: {
        permission: permission || 'VIEW',
      },
      create: {
        fileId,
        userId: targetUser.id,
        sharedById,
        permission: permission || 'VIEW',
      },
    });

    // Send email notification in background
    if (process.env.SMTP_USER) {
      const clientUrl = (process.env.CLIENT_URL || (req.headers.origin as string) || 'http://localhost:5173').replace(/\/$/, '');
      transporter.sendMail({
        from: `"FileSphere" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `A file has been shared with you on FileSphere`,
        html: `<p>Hello ${targetUser.name},</p>
               <p>User <b>${sharingUserIdentifier}</b> has shared the file <b>${file.name}</b> with you.</p>
               <p>Permission granted: <b>${permission || 'VIEW'}</b></p>
               <p><a href="${clientUrl}/shared">Click here to view your shared files</a></p>`,
      }).catch(emailErr => {
        console.error('Failed to send share email:', emailErr);
      });
    }

    res.json({ message: 'File shared successfully', fileShare });
  } catch (error) {
    console.error('shareFileWithUser error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
