import { Request, Response } from 'express';
import prisma from '../config/db';
import transporter from '../config/mail';
import { fileMetadataSelect } from '../utils/fileSelect';
import { getPublicLinkOptions, createSignedShareToken } from '../utils/publicLinkStore';

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
    const scope = (req.query.scope as string) || 'all'; // 'all' | 'with-me' | 'by-me'

    const trashedFolderIdsPromise = getTrashedFolderIds(userId);

    // 1. Files shared with me by others
    const sharedWithMePromise = (scope === 'all' || scope === 'with-me')
      ? prisma.fileShare.findMany({
          where: { userId },
          include: {
            file: { select: fileMetadataSelect },
            sharedBy: { select: { id: true, name: true, email: true } },
          },
        })
      : Promise.resolve([]);

    // 2. Files shared by me to others
    const sharedByMeUserPromise = (scope === 'all' || scope === 'by-me')
      ? prisma.fileShare.findMany({
          where: { sharedById: userId },
          include: {
            file: { select: fileMetadataSelect },
            user: { select: { id: true, name: true, email: true } },
          },
        })
      : Promise.resolve([]);

    // 3. Public files & folders owned by me
    const publicFoldersPromise = (scope === 'all' || scope === 'by-me')
      ? prisma.folder.findMany({
          where: { userId, isPublic: true, isTrashed: false },
        })
      : Promise.resolve([]);

    const publicFilesPromise = (scope === 'all' || scope === 'by-me')
      ? prisma.file.findMany({
          where: { userId, isPublic: true, isTrashed: false },
          select: fileMetadataSelect,
        })
      : Promise.resolve([]);

    const [trashedFolderIds, sharedWithMe, sharedByMeUser, publicFolders, publicFiles] = await Promise.all([
      trashedFolderIdsPromise,
      sharedWithMePromise,
      sharedByMeUserPromise,
      publicFoldersPromise,
      publicFilesPromise,
    ]);

    // Format files shared with me
    const withMeFiles = sharedWithMe
      .filter(s => s.file && !s.file.isTrashed)
      .map(s => ({
        ...s.file,
        shareScope: 'with-me',
        sharedBy: s.sharedBy.name || s.sharedBy.email,
        sharedByEmail: s.sharedBy.email,
        permission: s.permission,
        sharedAt: s.createdAt,
      }));

    // Format files shared by me to users
    const byMeDirectFiles = sharedByMeUser
      .filter(s => s.file && !s.file.isTrashed)
      .map(s => ({
        ...s.file,
        shareScope: 'by-me',
        sharedWithUser: s.user.name || s.user.email,
        sharedWithEmail: s.user.email,
        permission: s.permission,
        sharedAt: s.createdAt,
      }));

    // Format public files (shared by me via public link)
    const byMePublicFiles = publicFiles.map(f => ({
      ...f,
      shareScope: 'by-me',
      isPublic: true,
      sharedWithUser: 'Anyone with link',
      permission: 'VIEW',
      sharedAt: f.updatedAt || f.createdAt,
    }));

    // Deduplicate / aggregate by scope
    const allFilesMap = new Map();
    if (scope === 'with-me') {
      withMeFiles.forEach(f => allFilesMap.set(f.id, f));
    } else if (scope === 'by-me') {
      byMePublicFiles.forEach(f => allFilesMap.set(f.id, f));
      byMeDirectFiles.forEach(f => allFilesMap.set(f.id, f));
    } else {
      byMePublicFiles.forEach(f => allFilesMap.set(f.id, f));
      byMeDirectFiles.forEach(f => allFilesMap.set(f.id, f));
      withMeFiles.forEach(f => allFilesMap.set(f.id, f));
    }

    const files = Array.from(allFilesMap.values());
    const filteredFolders = publicFolders.filter(f => !trashedFolderIds.has(f.id));
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

    if (!email || !email.includes('@')) {
      res.status(400).json({ message: 'Please provide a valid email address' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: { id: true, name: true, originalName: true, userId: true },
    });

    if (!file || file.userId !== sharedById) {
      res.status(404).json({ message: 'File not found or unauthorized' });
      return;
    }

    // 1. Find or auto-provision account for recipient so file is waiting in their account immediately!
    let targetUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
      select: { id: true, name: true, email: true },
    });

    let isNewUser = false;
    if (!targetUser) {
      targetUser = await prisma.user.create({
        data: {
          email: cleanEmail,
          name: cleanEmail.split('@')[0],
          role: 'User',
        },
        select: { id: true, name: true, email: true },
      });
      isNewUser = true;
    }

    const sharingUser = await prisma.user.findUnique({
      where: { id: sharedById },
      select: { name: true, email: true },
    });

    const sharingUserIdentifier = sharingUser?.name || sharingUser?.email || 'A user';

    // 2. Upsert FileShare record
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

    const clientUrl = (process.env.CLIENT_URL || (req.headers.origin as string) || 'http://localhost:5173').replace(/\/$/, '');
    const directAccessUrl = `${clientUrl}/shared-with-me`;

    // 3. Send email notification in background
    if (process.env.SMTP_USER) {
      transporter.sendMail({
        from: `"FileSphere" <${process.env.SMTP_USER}>`,
        to: cleanEmail,
        subject: `File shared with you: ${file.originalName || file.name}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #F4F1EA; color: #2B2A26;">
            <div style="background: #FFFFFF; border-radius: 14px; padding: 32px; border: 1px solid #DEDACD;">
              <h2 style="font-family: Georgia, serif; color: #2F4E3B; margin-top: 0;">FileSphere File Sharing</h2>
              <p>Hello <b>${targetUser.name}</b>,</p>
              <p><b>${sharingUserIdentifier}</b> has shared a file with your account:</p>
              <div style="background: #ECE7DC; padding: 16px; border-radius: 8px; margin: 20px 0;">
                <div style="font-size: 16px; font-weight: bold; color: #2B2A26;">📄 ${file.originalName || file.name}</div>
                <div style="font-size: 13px; color: #5C5A52; margin-top: 4px;">Access permission: <b>${permission || 'VIEW'}</b></div>
              </div>
              <p style="margin: 24px 0;">
                <a href="${directAccessUrl}" style="background: #3F6B4F; color: #FFFFFF; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
                  Open File in FileSphere
                </a>
              </p>
              ${isNewUser ? `<p style="font-size: 12px; color: #5C5A52;">An account was prepared for ${cleanEmail}. You can sign in or set a password anytime.</p>` : ''}
            </div>
            <div style="text-align: center; font-size: 11px; color: #5C5A52; margin-top: 16px;">
              FileSphere Distributed Storage Architecture
            </div>
          </div>
        `,
      }).then(() => {
        console.log(`Share email successfully sent to ${cleanEmail}`);
      }).catch(emailErr => {
        console.error('Failed to send share email:', emailErr);
      });
    } else {
      console.log(`[Dev Simulation] Share notification for ${cleanEmail}: ${directAccessUrl}`);
    }

    res.json({
      message: `File shared with ${cleanEmail} successfully!`,
      fileShare,
      emailSent: !!process.env.SMTP_USER,
      isNewUser,
      targetUser: { name: targetUser.name, email: targetUser.email },
      accessUrl: directAccessUrl,
    });
  } catch (error) {
    console.error('shareFileWithUser error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getItemShares = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    // Ultra-fast parallel lookup for file or folder
    const [file, folder] = await Promise.all([
      prisma.file.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          userId: true,
          isPublic: true,
          publicLinkToken: true,
          user: { select: { id: true, name: true, email: true } },
          shares: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      prisma.folder.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          userId: true,
          isPublic: true,
          publicLinkToken: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    if (file) {
      if (file.userId !== userId) {
        res.status(403).json({ message: 'Unauthorized' });
        return;
      }
      const fileOpts = getPublicLinkOptions(file.publicLinkToken || file.id);
      const perm = fileOpts.permission || 'VIEW';
      const baseToken = file.publicLinkToken || file.id;
      const viewToken = createSignedShareToken(baseToken, 'VIEW');
      const editToken = createSignedShareToken(baseToken, 'EDIT');
      const signedToken = perm === 'EDIT' ? editToken : viewToken;

      res.json({
        owner: file.user,
        isPublic: file.isPublic,
        publicLinkToken: file.publicLinkToken,
        signedToken,
        viewToken,
        editToken,
        permission: perm,
        allowDownload: fileOpts.allowDownload !== false,
        shares: file.shares.map(s => ({
          id: s.id,
          userId: s.userId,
          user: s.user,
          permission: s.permission,
          createdAt: s.createdAt,
        })),
      });
      return;
    }

    if (folder) {
      if (folder.userId !== userId) {
        res.status(403).json({ message: 'Unauthorized' });
        return;
      }
      const folderOpts = getPublicLinkOptions(folder.publicLinkToken || folder.id);
      const perm = folderOpts.permission || 'VIEW';
      const baseToken = folder.publicLinkToken || folder.id;
      const viewToken = createSignedShareToken(baseToken, 'VIEW');
      const editToken = createSignedShareToken(baseToken, 'EDIT');
      const signedToken = perm === 'EDIT' ? editToken : viewToken;

      res.json({
        owner: folder.user,
        isPublic: folder.isPublic,
        publicLinkToken: folder.publicLinkToken,
        signedToken,
        viewToken,
        editToken,
        permission: perm,
        allowDownload: folderOpts.allowDownload !== false,
        shares: [],
      });
      return;
    }

    res.status(404).json({ message: 'Item not found' });
  } catch (error) {
    console.error('getItemShares error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const revokeShare = async (req: Request, res: Response): Promise<void> => {
  try {
    const shareId = req.params.shareId as string;
    const userId = (req as any).user.id;

    const fileShare = await prisma.fileShare.findUnique({
      where: { id: shareId },
      include: { file: { select: { userId: true } } },
    });

    if (!fileShare || fileShare.file.userId !== userId) {
      res.status(403).json({ message: 'Unauthorized or share not found' });
      return;
    }

    await prisma.fileShare.delete({ where: { id: shareId } });
    res.json({ message: 'Collaborator access revoked successfully' });
  } catch (error) {
    console.error('revokeShare error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateSharePermission = async (req: Request, res: Response): Promise<void> => {
  try {
    const shareId = req.params.shareId as string;
    const { permission } = req.body;
    const userId = (req as any).user.id;

    const fileShare = await prisma.fileShare.findUnique({
      where: { id: shareId },
      include: { file: { select: { userId: true } } },
    });

    if (!fileShare || fileShare.file.userId !== userId) {
      res.status(403).json({ message: 'Unauthorized or share not found' });
      return;
    }

    const updated = await prisma.fileShare.update({
      where: { id: shareId },
      data: { permission: permission === 'EDIT' ? 'EDIT' : 'VIEW' },
    });

    res.json(updated);
  } catch (error) {
    console.error('updateSharePermission error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
