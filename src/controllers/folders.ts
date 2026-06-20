import { Request, Response } from 'express';
import prisma from '../config/db';

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
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getFolderContents = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    // Root folder concept: if id is 'root', we fetch where parentId is null
    const folderId = id === 'root' ? null : id;

    const folders = await prisma.folder.findMany({
      where: {
        parentId: folderId,
        userId,
        isTrashed: false,
      },
    });

    const files = await prisma.file.findMany({
      where: {
        folderId,
        userId,
        isTrashed: false,
      },
    });

    res.json({ folders, files });
  } catch (error) {
    console.error(error);
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

    res.json({ message: 'Folder moved to trash' });
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

export const toggleShareFolder = async (req: Request, res: Response): Promise<void> => {
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
      data: { isPublic: !folder.isPublic },
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

