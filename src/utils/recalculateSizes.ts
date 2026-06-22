import prisma from '../config/db';

async function recalculate() {
  console.log('Resetting all folder sizes to 0...');
  // @ts-ignore
  await prisma.folder.updateMany({
    data: { size: 0 }
  });

  console.log('Fetching all files...');
  const files = await prisma.file.findMany();

  console.log('Recalculating folder sizes...');
  for (const file of files) {
    if (file.folderId) {
      let currentFolderId: string | null = file.folderId;
      while (currentFolderId) {
        // @ts-ignore
        const folder = await prisma.folder.update({
          where: { id: currentFolderId },
          data: { size: { increment: file.size } }
        });
        currentFolderId = folder.parentId;
      }
    }
  }
  console.log('Done recalculating sizes.');
}

recalculate()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
