const prisma = require('./db');
const bcrypt = require('bcryptjs');

async function main() {
  console.log('Seeding database...');

  const userNames = ['Aisha', 'Rohan', 'Priya', 'Meera', 'Sam', 'Dev'];
  const users = {};
  const hashedPassword = await bcrypt.hash('password123', 10);

  for (const name of userNames) {
    users[name] = await prisma.user.upsert({
      where: { name },
      update: { password: hashedPassword },
      create: { name, password: hashedPassword },
    });
  }

  let group = await prisma.group.findFirst({
    where: { name: 'Flat 204 Expenses' },
  });

  if (!group) {
    group = await prisma.group.create({
      data: {
        name: 'Flat 204 Expenses',
        description: 'Shared household and trip expenses',
      },
    });
  }

  const memberships = [
    { name: 'Aisha', joinedAt: new Date('2026-02-01T00:00:00Z'), leftAt: null },
    { name: 'Rohan', joinedAt: new Date('2026-02-01T00:00:00Z'), leftAt: null },
    { name: 'Priya', joinedAt: new Date('2026-02-01T00:00:00Z'), leftAt: null },
    { name: 'Meera', joinedAt: new Date('2026-02-01T00:00:00Z'), leftAt: new Date('2026-03-31T23:59:59Z') },
    { name: 'Sam', joinedAt: new Date('2026-04-15T00:00:00Z'), leftAt: null },
    { name: 'Dev', joinedAt: new Date('2026-03-01T00:00:00Z'), leftAt: new Date('2026-03-31T23:59:59Z') },
  ];

  for (const mem of memberships) {
    const userId = users[mem.name].id;
    await prisma.groupMember.upsert({
      where: {
        groupId_userId: {
          groupId: group.id,
          userId: userId,
        },
      },
      update: {
        joinedAt: mem.joinedAt,
        leftAt: mem.leftAt,
      },
      create: {
        groupId: group.id,
        userId: userId,
        joinedAt: mem.joinedAt,
        leftAt: mem.leftAt,
      },
    });
  }

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
