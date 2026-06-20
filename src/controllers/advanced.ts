import { Request, Response } from 'express';
import prisma from '../config/db';

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

    const folders = await prisma.folder.findMany({
      where: { userId, isStarred: true, isTrashed: false },
    });

    const files = await prisma.file.findMany({
      where: { userId, isStarred: true, isTrashed: false },
    });

    res.json({ folders, files });
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

    const folders = await prisma.folder.findMany({
      where: {
        userId,
        isTrashed: false,
        name: { contains: query, mode: 'insensitive' },
      },
    });

    const files = await prisma.file.findMany({
      where: {
        userId,
        isTrashed: false,
        name: { contains: query, mode: 'insensitive' },
      },
    });

    res.json({ folders, files });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getShared = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    const folders = await prisma.folder.findMany({
      where: { userId, isPublic: true, isTrashed: false },
    });

    const files = await prisma.file.findMany({
      where: { userId, isPublic: true, isTrashed: false },
    });

    res.json({ folders, files });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getStorage = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    const files = await prisma.file.findMany({
      where: { userId, isTrashed: false },
      orderBy: { size: 'desc' }
    });

    // In storage view, usually we display just files ordered by size
    // or maybe folders too, but folders don't have an inherent size in the schema unless calculated.
    // For simplicity, we just return files.
    res.json({ folders: [], files });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
