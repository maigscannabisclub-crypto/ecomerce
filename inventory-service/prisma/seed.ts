import { PrismaClient, MovementType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Sample inventory data
  const inventoryData = [
    {
      productId: 'prod-001',
      sku: 'SKU-001-PHONE',
      quantity: 100,
      reserved: 0,
      available: 100,
      minStock: 10,
      reorderPoint: 25,
      location: 'WAREHOUSE-A-01',
    },
    {
      productId: 'prod-002',
      sku: 'SKU-002-LAPTOP',
      quantity: 50,
      reserved: 5,
      available: 45,
      minStock: 5,
      reorderPoint: 15,
      location: 'WAREHOUSE-A-02',
    },
    {
      productId: 'prod-003',
      sku: 'SKU-003-TABLET',
      quantity: 8,
      reserved: 2,
      available: 6,
      minStock: 10,
      reorderPoint: 20,
      location: 'WAREHOUSE-B-01',
    },
    {
      productId: 'prod-004',
      sku: 'SKU-004-WATCH',
      quantity: 200,
      reserved: 10,
      available: 190,
      minStock: 20,
      reorderPoint: 50,
      location: 'WAREHOUSE-A-03',
    },
    {
      productId: 'prod-005',
      sku: 'SKU-005-EARBUDS',
      quantity: 5,
      reserved: 0,
      available: 5,
      minStock: 15,
      reorderPoint: 30,
      location: 'WAREHOUSE-B-02',
    },
  ];

  for (const data of inventoryData) {
    const inventory = await prisma.inventory.upsert({
      where: { productId: data.productId },
      update: {},
      create: data,
    });

    console.log(`✅ Created/Updated inventory for product: ${inventory.productId}`);

    // Create initial movement record for IN
    await prisma.inventoryMovement.create({
      data: {
        inventoryId: inventory.id,
        type: MovementType.IN,
        quantity: data.quantity,
        reason: 'Initial stock entry',
      },
    });

    // Create movement record for reserved if any
    if (data.reserved > 0) {
      await prisma.inventoryMovement.create({
        data: {
          inventoryId: inventory.id,
          type: MovementType.RESERVE,
          quantity: data.reserved,
          reason: 'Initial reservation',
        },
      });
    }
  }

  console.log('✅ Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
