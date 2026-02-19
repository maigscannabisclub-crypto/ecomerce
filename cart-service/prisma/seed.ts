import { PrismaClient, CartStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding cart database...');

  // Clean existing data
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();

  // Create sample carts for testing
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Sample cart 1 - Active cart with items
  const cart1 = await prisma.cart.create({
    data: {
      id: 'cart-001',
      userId: 'user-001',
      total: 299.97,
      status: CartStatus.ACTIVE,
      expiresAt,
      items: {
        create: [
          {
            id: 'item-001',
            productId: 'prod-001',
            productName: 'Wireless Headphones',
            productSku: 'WH-001',
            quantity: 1,
            unitPrice: 99.99,
            subtotal: 99.99,
          },
          {
            id: 'item-002',
            productId: 'prod-002',
            productName: 'Smart Watch',
            productSku: 'SW-001',
            quantity: 2,
            unitPrice: 99.99,
            subtotal: 199.98,
          },
        ],
      },
    },
  });

  // Sample cart 2 - Empty active cart
  const cart2 = await prisma.cart.create({
    data: {
      id: 'cart-002',
      userId: 'user-002',
      total: 0,
      status: CartStatus.ACTIVE,
      expiresAt,
      items: {},
    },
  });

  // Sample cart 3 - Converted cart (completed purchase)
  const cart3 = await prisma.cart.create({
    data: {
      id: 'cart-003',
      userId: 'user-003',
      total: 149.99,
      status: CartStatus.CONVERTED,
      expiresAt: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Expired yesterday
      items: {
        create: [
          {
            id: 'item-003',
            productId: 'prod-003',
            productName: 'Bluetooth Speaker',
            productSku: 'BS-001',
            quantity: 1,
            unitPrice: 149.99,
            subtotal: 149.99,
          },
        ],
      },
    },
  });

  // Sample cart 4 - Abandoned cart
  const cart4 = await prisma.cart.create({
    data: {
      id: 'cart-004',
      userId: 'user-004',
      total: 49.99,
      status: CartStatus.ABANDONED,
      expiresAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // Expired 2 days ago
      items: {
        create: [
          {
            id: 'item-004',
            productId: 'prod-004',
            productName: 'Phone Case',
            productSku: 'PC-001',
            quantity: 1,
            unitPrice: 49.99,
            subtotal: 49.99,
          },
        ],
      },
    },
  });

  console.log('Seeded carts:');
  console.log(`- Cart 1 (Active with items): ${cart1.id}`);
  console.log(`- Cart 2 (Empty active): ${cart2.id}`);
  console.log(`- Cart 3 (Converted): ${cart3.id}`);
  console.log(`- Cart 4 (Abandoned): ${cart4.id}`);
  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
