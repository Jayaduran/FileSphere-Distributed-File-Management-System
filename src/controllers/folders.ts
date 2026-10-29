import { Request, Response } from 'express';
import prisma from '../config/db';
import { ZipArchive } from 'archiver';
import fs from 'fs';
import path from 'path';
import { updateFolderSize } from '../utils/folderSize';
import { fileMetadataSelect } from '../utils/fileSelect';
import { setPublicLinkOptions, getPublicLinkOptions, deletePublicLinkOptions, createSignedShareToken, verifyShareToken } from '../utils/publicLinkStore';
import { getOptionalAuthUser, resolveUniqueFileName } from './files';
import { recordAccess } from '../utils/accessHistoryStore';
import { sanitizeFileName, sanitizeFolderName, checkRateLimit } from '../utils/security';

export const createFolder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, parentId } = req.body;
    const userId = (req as any).user.id;

    // If folder already exists, return it (idempotent for folder upload)
    const existingFolder = await prisma.folder.findFirst({
      where: {
        name,
        parentId: parentId || null,
        userId,
      },
    });

    if (existingFolder) {
      res.status(200).json(existingFolder);
      return;
    }

    const folder = await prisma.folder.create({
      data: {
        name,
        parentId: parentId || null,
        userId,
      },
    });

    res.status(201).json(folder);
  } catch (error) {
    console.error('createFolder error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Batch create folder hierarchy in 1 ultra-fast roundtrip
export const createFolderBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { parentId, directories } = req.body;
    const userId = (req as any).user.id;

    if (!Array.isArray(directories) || directories.length === 0) {
      res.json({ pathMap: {} });
      return;
    }

    const pathMap: Record<string, string> = {};
    const rootParentId = parentId === 'root' || !parentId ? null : parentId;

    // Sort by path depth so parents are always processed before children
    const sortedDirs = [...directories].sort((a, b) => a.split('/').length - b.split('/').length);

    for (const dirPath of sortedDirs) {
      const parts = dirPath.split('/');
      const folderName = parts[parts.length - 1];
      const parentSubPath = parts.slice(0, -1).join('/');

      const currentParentId = parentSubPath ? (pathMap[parentSubPath] || rootParentId) : rootParentId;

      let folder = await prisma.folder.findFirst({
        where: {
          name: folderName,
          parentId: currentParentId,
          userId,
          isTrashed: false,
        },
        select: { id: true },
      });

      if (!folder) {
        folder = await prisma.folder.create({
          data: {
            name: folderName,
            parentId: currentParentId,
            userId,
          },
          select: { id: true },
        });
      }

      pathMap[dirPath] = folder.id;
    }

    res.json({ pathMap });
  } catch (error) {
    console.error('createFolderBatch error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getFolderContents = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    // Root folder concept: if id is 'root', we fetch where parentId is null
    const folderId = id === 'root' ? null : id;

    const [folders, files] = await Promise.all([
      prisma.folder.findMany({
        where: {
          parentId: folderId,
          userId,
          isTrashed: false,
        },
      }),
      prisma.file.findMany({
        where: {
          folderId,
          userId,
          isTrashed: false,
        },
        select: fileMetadataSelect,
      }),
    ]);

    res.json({ folders, files });
  } catch (error) {
    console.error('getFolderContents error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteFolder = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    // Check if folder exists and belongs to user
    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder || folder.userId !== userId) {
      res.status(404).json({ message: 'Folder not found' });
      return;
    }

    // Soft delete instead of hard delete
    await prisma.folder.update({
      where: { id },
      data: { isTrashed: true },
    });

    if (folder.parentId) {
      await updateFolderSize(folder.parentId, -folder.size);
    }

    res.json({ message: 'Folder moved to trash' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteFolderPermanently = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const folder = await prisma.folder.findUnique({ where: { id } });

    if (!folder || folder.userId !== userId) {
      res.status(404).json({ message: 'Folder not found' });
      return;
    }

    // Prisma onDelete: Cascade will delete child folders and files if configured,
    // but in SQLite we might need to handle it manually or rely on Prisma.
    // For now, delete the folder (make sure schema supports cascade or manually delete children if needed).
    // Actually, prisma schema doesn't have onDelete: Cascade for Folder children/files in this schema.
    // To be safe, we will just delete this folder. If it fails due to foreign key constraint, we'd need recursive delete.
    // We will do a simple delete. If it errors, we can fix it.
    await prisma.folder.delete({
      where: { id },
    });

    res.json({ message: 'Folder deleted permanently' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const restoreFolder = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder || folder.userId !== userId) {
      res.status(404).json({ message: 'Folder not found' });
      return;
    }

    await prisma.folder.update({
      where: { id },
      data: { isTrashed: false },
    });

    if (folder.parentId) {
      await updateFolderSize(folder.parentId, folder.size);
    }

    res.json({ message: 'Folder restored' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const toggleStarFolder = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder || folder.userId !== userId) {
      res.status(404).json({ message: 'Folder not found' });
      return;
    }

    const updated = await prisma.folder.update({
      where: { id },
      data: { isStarred: !folder.isStarred },
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

async function getAllSubfolderIds(folderId: string, visited: Set<string> = new Set()): Promise<string[]> {
  if (visited.has(folderId)) return [];
  visited.add(folderId);
  const children = await prisma.folder.findMany({
    where: { parentId: folderId },
    select: { id: true },
  });
  let ids = children.map(c => c.id);
  for (const child of children) {
    if (!visited.has(child.id)) {
      const subIds = await getAllSubfolderIds(child.id, visited);
      ids = ids.concat(subIds);
    }
  }
  return ids;
}

export const toggleShareFolder = async (req: Request, res: Response): Promise<void> => {
  return toggleFolderPublic(req, res);
};

export const toggleFolderPublic = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;
    const { allowDownload, permission } = req.body || {};

    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder || folder.userId !== userId) {
      res.status(404).json({ message: 'Folder not found' });
      return;
    }

    const nextPublic = !folder.isPublic;
    const publicLinkToken = nextPublic && !folder.publicLinkToken
      ? Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10)
      : folder.publicLinkToken;

    const allFolderIds = [id, ...(await getAllSubfolderIds(id))];

    const updated = await prisma.folder.update({
      where: { id },
      data: { isPublic: nextPublic, publicLinkToken },
    });

    if (nextPublic) {
      // Cascading: make all nested folders and files public
      await Promise.all([
        prisma.folder.updateMany({
          where: { id: { in: allFolderIds } },
          data: { isPublic: true },
        }),
        prisma.file.updateMany({
          where: { folderId: { in: allFolderIds } },
          data: { isPublic: true },
        }),
      ]);
      if (publicLinkToken) {
        setPublicLinkOptions(publicLinkToken, { allowDownload, permission });
      }
    } else {
      await Promise.all([
        prisma.folder.updateMany({
          where: { id: { in: allFolderIds }, publicLinkToken: null },
          data: { isPublic: false },
        }),
        prisma.file.updateMany({
          where: { folderId: { in: allFolderIds }, publicLinkToken: null },
          data: { isPublic: false },
        }),
      ]);
      if (folder.publicLinkToken) {
        deletePublicLinkOptions(folder.publicLinkToken);
      }
    }

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const generatePublicLinkFolder = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;
    const { allowDownload, permission } = req.body || {};

    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder || folder.userId !== userId) {
      res.status(404).json({ message: 'Folder not found' });
      return;
    }

    const publicLinkToken = folder.publicLinkToken || (Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10));
    const allFolderIds = [id, ...(await getAllSubfolderIds(id))];

    // Cascading: mark all subfolders and files in this folder public
    const [updated] = await Promise.all([
      prisma.folder.update({
        where: { id },
        data: { publicLinkToken, isPublic: true },
      }),
      prisma.folder.updateMany({
        where: { id: { in: allFolderIds } },
        data: { isPublic: true },
      }),
      prisma.file.updateMany({
        where: { folderId: { in: allFolderIds } },
        data: { isPublic: true },
      }),
    ]);

    const perm: 'VIEW' | 'EDIT' = permission === 'EDIT' ? 'EDIT' : 'VIEW';
    setPublicLinkOptions(publicLinkToken, { allowDownload, permission: perm });
    setPublicLinkOptions(id, { allowDownload, permission: perm });

    const viewToken = createSignedShareToken(publicLinkToken, 'VIEW');
    const editToken = createSignedShareToken(publicLinkToken, 'EDIT');
    const signedToken = perm === 'EDIT' ? editToken : viewToken;

    res.json({
      ...updated,
      allowDownload,
      permission: perm,
      publicLinkToken,
      signedToken,
      viewToken,
      editToken,
    });
  } catch (error) {
    console.error('generatePublicLinkFolder error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const revokePublicLinkFolder = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder || folder.userId !== userId) {
      res.status(404).json({ message: 'Folder not found' });
      return;
    }

    const allFolderIds = [id, ...(await getAllSubfolderIds(id))];
    if (folder.publicLinkToken) {
      deletePublicLinkOptions(folder.publicLinkToken);
    }
    deletePublicLinkOptions(id);

    const [updated] = await Promise.all([
      prisma.folder.update({
        where: { id },
        data: { publicLinkToken: null, isPublic: false },
      }),
      prisma.folder.updateMany({
        where: { id: { in: allFolderIds }, publicLinkToken: null },
        data: { isPublic: false },
      }),
      prisma.file.updateMany({
        where: { folderId: { in: allFolderIds }, publicLinkToken: null },
        data: { isPublic: false },
      }),
    ]);

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const downloadFolder = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    // Verify folder exists and user has access
    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder || folder.userId !== userId) {
      res.status(404).json({ message: 'Folder not found' });
      return;
    }

    res.attachment(`${folder.name}.zip`);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    archive.on('error', (err: any) => {
      console.error(err);
      res.status(500).end();
    });

    archive.pipe(res);

    // Recursive function to append files and folders to archive
    const appendFolderToArchive = async (currentFolderId: string, currentPath: string) => {
      // Find subfolders
      const subfolders = await prisma.folder.findMany({
        where: { parentId: currentFolderId, isTrashed: false }
      });

      // Find files
      const files = await prisma.file.findMany({
        where: { folderId: currentFolderId, isTrashed: false }
      });

      for (const file of files) {
        if (file.data) {
          archive.append(file.data, { name: path.join(currentPath, file.originalName) });
        }
      }

      for (const sub of subfolders) {
        await appendFolderToArchive(sub.id, path.join(currentPath, sub.name));
      }
    };

    await appendFolderToArchive(folder.id, '');
    archive.finalize();

  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
};

export const renameFolder = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { name } = req.body;
    const userId = (req as any).user.id;

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ message: 'Valid name is required' });
      return;
    }

    const folder = await prisma.folder.findUnique({
      where: { id },
      select: { id: true, userId: true, isPublic: true, publicLinkToken: true },
    });

    if (!folder) {
      res.status(404).json({ message: 'Folder not found' });
      return;
    }

    let canEdit = folder.userId === userId;
    if (!canEdit) {
      if (folder.isPublic && folder.publicLinkToken) {
        const publicOpts = getPublicLinkOptions(folder.publicLinkToken);
        if (publicOpts.permission === 'EDIT') {
          canEdit = true;
        }
      }
    }

    if (!canEdit) {
      res.status(403).json({ message: 'Unauthorized to edit this folder' });
      return;
    }

    const updated = await prisma.folder.update({
      where: { id },
      data: { name: name.trim() },
    });

    res.json(updated);
  } catch (error) {
    console.error('renameFolder error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const moveFolder = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { parentId } = req.body;
    const userId = (req as any).user.id;

    const targetParentId = !parentId || parentId === 'root' ? null : parentId;

    const subfolderIds = await getAllSubfolderIds(id);
    if (id === targetParentId || (targetParentId && subfolderIds.includes(targetParentId))) {
      res.status(400).json({ message: 'Cannot move folder into itself or its subfolders' });
      return;
    }

    const folder = await prisma.folder.findUnique({
      where: { id },
      select: { id: true, userId: true, parentId: true, size: true },
    });

    if (!folder || folder.userId !== userId) {
      res.status(404).json({ message: 'Folder not found or unauthorized' });
      return;
    }

    if (targetParentId) {
      const targetFolder = await prisma.folder.findUnique({
        where: { id: targetParentId },
        select: { id: true, userId: true },
      });
      if (!targetFolder || targetFolder.userId !== userId) {
        res.status(404).json({ message: 'Target folder not found or unauthorized' });
        return;
      }
    }

    const oldParentId = folder.parentId;

    const updated = await prisma.folder.update({
      where: { id },
      data: { parentId: targetParentId },
    });

    if (oldParentId) updateFolderSize(oldParentId, -folder.size).catch(console.error);
    if (targetParentId) updateFolderSize(targetParentId, folder.size).catch(console.error);

    res.json(updated);
  } catch (error) {
    console.error('moveFolder error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getAllFoldersTree = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const folders = await prisma.folder.findMany({
      where: { userId, isTrashed: false },
      select: { id: true, name: true, parentId: true, size: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    res.json({ folders });
  } catch (error) {
    console.error('getAllFoldersTree error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

async function isSubfolderOf(subfolderId: string, rootFolderId: string): Promise<boolean> {
  if (subfolderId === rootFolderId) return true;
  let currentId: string | null = subfolderId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    if (currentId === rootFolderId) return true;
    const parent: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    if (!parent) return false;
    currentId = parent.parentId;
  }
  return false;
}

export const publicFolderUpload = async (req: Request, res: Response): Promise<void> => {
  try {
    let token = (req.params.token || req.params.id) as string;
    if (!token) {
      res.status(400).json({ message: 'Folder token is required' });
      return;
    }
    if (token.includes('/folders/link/')) {
      token = token.split('/folders/link/').pop()?.split('?')[0].split('/')[0] || token;
    } else if (token.includes('/folders/')) {
      token = token.split('/folders/').pop()?.split('?')[0].split('/')[0] || token;
    }
    token = token.replace(/\/+$/, '').trim();

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'guest';
    if (!checkRateLimit(clientIp, 'public-upload', 60)) {
      res.status(429).json({ message: 'Too many upload requests. Please slow down.' });
      return;
    }

    const verified = verifyShareToken(token);
    if (verified.isTampered) {
      res.status(403).json({
        message: 'Security Alert: Tampered or invalid share link. Upload is blocked.',
        tampered: true,
      });
      return;
    }

    if (verified.enforcedPermission === 'VIEW') {
      res.status(403).json({
        message: 'This shared folder is view-only. Adding new files is strictly disabled.',
        viewOnly: true,
      });
      return;
    }

    const cleanToken = verified.cleanToken;
    const authUser = getOptionalAuthUser(req);

    const folder = await prisma.folder.findFirst({
      where: {
        OR: [
          { publicLinkToken: cleanToken },
          { id: cleanToken },
          { publicLinkToken: token },
          { id: token },
        ],
      },
    });

    if (!folder || folder.isTrashed) {
      res.status(404).json({ message: 'Shared folder not found or link is invalid' });
      return;
    }

    const isOwner = Boolean(authUser && authUser.id === folder.userId);
    const options = getPublicLinkOptions(folder.publicLinkToken || folder.id);

    // Cryptographic permission takes precedence; query can only downgrade to view, never upgrade
    let allowsEdit = false;
    if (verified.enforcedPermission === 'EDIT') {
      allowsEdit = isOwner || options.permission === 'EDIT';
    } else if (options.permission === 'EDIT' || isOwner) {
      allowsEdit = true;
    }

    const requestedMode = ((req.query.mode as string) || (req.query.permission as string) || '').toLowerCase();
    if (requestedMode === 'view') {
      allowsEdit = false;
    }

    // 1. When VIEW permission: editing/adding is strictly disabled!
    if (!allowsEdit) {
      res.status(403).json({
        message: 'This shared folder is view-only. Adding new files is disabled.',
        viewOnly: true,
      });
      return;
    }

    // 2. To edit/upload: user MUST be logged in!
    if (!authUser) {
      res.status(401).json({
        message: 'Please sign in to your FileSphere account to add files.',
        requireLogin: true,
      });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }

    // Target subfolder inside shared folder hierarchy (optional)
    let targetFolderId = folder.id;
    const requestedFolderId = (req.body.folderId || req.body.subfolderId) as string;
    if (requestedFolderId && requestedFolderId !== folder.id) {
      const isValidChild = await isSubfolderOf(requestedFolderId, folder.id);
      if (!isValidChild) {
        res.status(403).json({ message: 'Access denied: Target subfolder is outside this shared folder hierarchy.' });
        return;
      }
      targetFolderId = requestedFolderId;
    }

    const safeOriginalName = sanitizeFileName(file.originalname);
    const uniqueName = await resolveUniqueFileName(safeOriginalName, targetFolderId, folder.userId);

    const created = await prisma.file.create({
      data: {
        name: uniqueName,
        originalName: safeOriginalName,
        mimeType: file.mimetype,
        size: file.size,
        data: file.buffer,
        userId: folder.userId,
        folderId: targetFolderId,
        isPublic: true,
      },
      select: fileMetadataSelect,
    });

    // Update parent folder size
    updateFolderSize(targetFolderId, file.size).catch(console.error);

    recordAccess({
      fileId: created.id,
      action: 'EDIT',
      actor: authUser?.name || authUser?.email || `Public Collaborator (${req.ip || 'web'})`,
      actorEmail: authUser?.email,
      isOwner,
      ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '',
      userAgent: (req.headers['user-agent'] as string) || '',
    });

    res.status(201).json(created);
  } catch (error) {
    console.error('publicFolderUpload error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const publicFolderCreateFolder = async (req: Request, res: Response): Promise<void> => {
  try {
    let token = (req.params.token || req.params.id) as string;
    if (!token) {
      res.status(400).json({ message: 'Folder token is required' });
      return;
    }
    if (token.includes('/folders/link/')) {
      token = token.split('/folders/link/').pop()?.split('?')[0].split('/')[0] || token;
    } else if (token.includes('/folders/')) {
      token = token.split('/folders/').pop()?.split('?')[0].split('/')[0] || token;
    }
    token = token.replace(/\/+$/, '').trim();

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'guest';
    if (!checkRateLimit(clientIp, 'public-create-folder', 30)) {
      res.status(429).json({ message: 'Too many folder creation requests. Please slow down.' });
      return;
    }

    const verified = verifyShareToken(token);
    if (verified.isTampered) {
      res.status(403).json({
        message: 'Security Alert: Tampered or invalid share link. Folder creation is blocked.',
        tampered: true,
      });
      return;
    }

    if (verified.enforcedPermission === 'VIEW') {
      res.status(403).json({
        message: 'This shared folder is view-only. Creating subfolders is strictly disabled.',
        viewOnly: true,
      });
      return;
    }

    const cleanToken = verified.cleanToken;
    const authUser = getOptionalAuthUser(req);
    const { name, parentId } = req.body;

    const safeFolderName = sanitizeFolderName(name);
    if (!safeFolderName) {
      res.status(400).json({ message: 'Valid folder name is required' });
      return;
    }

    const folder = await prisma.folder.findFirst({
      where: {
        OR: [
          { publicLinkToken: cleanToken },
          { id: cleanToken },
          { publicLinkToken: token },
          { id: token },
        ],
      },
    });

    if (!folder || folder.isTrashed) {
      res.status(404).json({ message: 'Shared folder not found or link is invalid' });
      return;
    }

    const isOwner = Boolean(authUser && authUser.id === folder.userId);
    const options = getPublicLinkOptions(folder.publicLinkToken || folder.id);

    let allowsEdit = false;
    if (verified.enforcedPermission === 'EDIT') {
      allowsEdit = isOwner || options.permission === 'EDIT';
    } else if (options.permission === 'EDIT' || isOwner) {
      allowsEdit = true;
    }

    const requestedMode = ((req.query.mode as string) || (req.query.permission as string) || '').toLowerCase();
    if (requestedMode === 'view') {
      allowsEdit = false;
    }

    // 1. When VIEW permission: editing/adding is strictly disabled!
    if (!allowsEdit) {
      res.status(403).json({
        message: 'This shared folder is view-only. Creating subfolders is disabled.',
        viewOnly: true,
      });
      return;
    }

    // 2. To edit/create folder: user MUST be logged in!
    if (!authUser) {
      res.status(401).json({
        message: 'Please sign in to your FileSphere account to create subfolders.',
        requireLogin: true,
      });
      return;
    }

    // Target parent folder inside shared hierarchy (optional)
    let targetParentId = folder.id;
    if (parentId && parentId !== folder.id) {
      const isValidChild = await isSubfolderOf(parentId, folder.id);
      if (!isValidChild) {
        res.status(403).json({ message: 'Access denied: Target parent folder is outside this shared folder hierarchy.' });
        return;
      }
      targetParentId = parentId;
    }

    // Check if folder with same name already exists in this directory
    const existing = await prisma.folder.findFirst({
      where: {
        name: safeFolderName,
        parentId: targetParentId,
        userId: folder.userId,
      },
    });

    if (existing) {
      res.status(200).json(existing);
      return;
    }

    const created = await prisma.folder.create({
      data: {
        name: safeFolderName,
        parentId: targetParentId,
        userId: folder.userId,
        isPublic: true,
      },
    });

    res.status(201).json(created);
  } catch (error) {
    console.error('publicFolderCreateFolder error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

