import prisma from '../config/db';

export const updateFolderSize = async (folderId: string | null, sizeDiff: number) => {
  if (!folderId) return;

  let currentFolderId: string | null = folderId;

  while (currentFolderId) {
    // @ts-ignore
    const folder = await prisma.folder.update({
      where: { id: currentFolderId },
      data: { size: { increment: sizeDiff } },
    });
    currentFolderId = folder.parentId;
  }
};
