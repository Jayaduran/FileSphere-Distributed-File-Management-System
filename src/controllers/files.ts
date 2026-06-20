import { Request, Response } from 'express';
import prisma from '../config/db';
import path from 'path';
import fs from 'fs';

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
        path: file.path,
        folderId: parsedFolderId,
        userId,
      },
    });

    res.status(201).json(dbFile);
  } catch (error) {
    console.error(error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const downloadFile = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const userId = (req as any).user.id;

    const file = await prisma.file.findUnique({ where: { id } });

    if (!file || (file.userId !== userId && !file.isPublic)) {
      res.status(404).json({ message: 'File not found' });
      return;
    }

    if (file.isTrashed) {
      res.status(400).json({ message: 'File is in trash' });
      return;
    }

    if (!fs.existsSync(file.path)) {
      res.status(404).json({ message: 'File not found on disk' });
      return;
    }

    res.download(file.path, file.originalName);
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

    res.json({ message: 'File moved to trash' });
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

    if (!fs.existsSync(file.path)) {
      res.status(404).json({ message: 'File not found on disk' });
      return;
    }

    res.download(file.path, file.originalName);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
