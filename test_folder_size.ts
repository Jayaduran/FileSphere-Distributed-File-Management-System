import prisma from './src/config/db';
import { updateFolderSize } from './src/utils/folderSize';

async function test() {
  const user = await prisma.user.findFirst();
  if (!user) return console.log('No user');

  const folder = await prisma.folder.create({
    data: { name: 'TestFolderSize', userId: user.id }
  });
  console.log('Created folder:', folder.id, 'size:', folder.size);

  await updateFolderSize(folder.id, 1024);

  const updatedFolder = await prisma.folder.findUnique({ where: { id: folder.id }});
  console.log('Updated folder size:', updatedFolder?.size);
}

test().catch(console.error).finally(() => prisma.$disconnect());
