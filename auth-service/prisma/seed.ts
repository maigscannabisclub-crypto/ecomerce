import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Starting database seed...');

  // Hash passwords
  const adminPassword = await bcrypt.hash('Admin123!', 12);
  const userPassword = await bcrypt.hash('User123!', 12);

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@ecommerce.com' },
    update: {},
    create: {
      email: 'admin@ecommerce.com',
      password: adminPassword,
      firstName: 'System',
      lastName: 'Administrator',
      role: Role.ADMIN,
      isActive: true,
    },
  });
  console.log(`✅ Created admin user: ${admin.email}`);

  // Create test user
  const user = await prisma.user.upsert({
    where: { email: 'user@ecommerce.com' },
    update: {},
    create: {
      email: 'user@ecommerce.com',
      password: userPassword,
      firstName: 'Test',
      lastName: 'User',
      role: Role.USER,
      isActive: true,
    },
  });
  console.log(`✅ Created test user: ${user.email}`);

  // Create additional test users
  const testUsers = [
    { email: 'john.doe@ecommerce.com', firstName: 'John', lastName: 'Doe' },
    { email: 'jane.smith@ecommerce.com', firstName: 'Jane', lastName: 'Smith' },
    { email: 'mike.wilson@ecommerce.com', firstName: 'Mike', lastName: 'Wilson' },
  ];

  for (const testUser of testUsers) {
    const password = await bcrypt.hash('Test123!', 12);
    const created = await prisma.user.upsert({
      where: { email: testUser.email },
      update: {},
      create: {
        email: testUser.email,
        password,
        firstName: testUser.firstName,
        lastName: testUser.lastName,
        role: Role.USER,
        isActive: true,
      },
    });
    console.log(`✅ Created test user: ${created.email}`);
  }

  console.log('🎉 Database seed completed successfully!');
}

main()
  .catch((error) => {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
