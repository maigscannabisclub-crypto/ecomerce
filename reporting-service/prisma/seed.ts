import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding reporting database...');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const lastMonth = new Date(today);
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  // Seed Daily Metrics
  await prisma.dailyMetric.createMany({
    data: [
      {
        date: today,
        totalOrders: 45,
        totalRevenue: 12500.50,
        newCustomers: 12,
        topProductId: 'prod-001',
      },
      {
        date: yesterday,
        totalOrders: 52,
        totalRevenue: 15800.75,
        newCustomers: 15,
        topProductId: 'prod-002',
      },
      {
        date: lastWeek,
        totalOrders: 38,
        totalRevenue: 9800.25,
        newCustomers: 8,
        topProductId: 'prod-001',
      },
    ],
    skipDuplicates: true,
  });

  // Seed Sales Reports
  await prisma.salesReport.createMany({
    data: [
      {
        period: 'DAILY',
        periodStart: today,
        periodEnd: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
        totalOrders: 45,
        totalRevenue: 12500.50,
        totalTax: 1250.05,
        totalShipping: 450.00,
        averageOrderValue: 277.79,
        data: {
          topCategories: ['Electronics', 'Clothing'],
          paymentMethods: { credit_card: 30, paypal: 15 },
        },
      },
      {
        period: 'DAILY',
        periodStart: yesterday,
        periodEnd: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1),
        totalOrders: 52,
        totalRevenue: 15800.75,
        totalTax: 1580.08,
        totalShipping: 520.00,
        averageOrderValue: 303.86,
        data: {
          topCategories: ['Electronics', 'Home'],
          paymentMethods: { credit_card: 35, paypal: 17 },
        },
      },
      {
        period: 'WEEKLY',
        periodStart: lastWeek,
        periodEnd: today,
        totalOrders: 312,
        totalRevenue: 87500.00,
        totalTax: 8750.00,
        totalShipping: 3120.00,
        averageOrderValue: 280.45,
        data: {
          topCategories: ['Electronics', 'Clothing', 'Home'],
          growthRate: 12.5,
        },
      },
      {
        period: 'MONTHLY',
        periodStart: lastMonth,
        periodEnd: today,
        totalOrders: 1250,
        totalRevenue: 350000.00,
        totalTax: 35000.00,
        totalShipping: 12500.00,
        averageOrderValue: 280.00,
        data: {
          topCategories: ['Electronics', 'Clothing', 'Home', 'Sports'],
          growthRate: 8.3,
        },
      },
    ],
    skipDuplicates: true,
  });

  // Seed Product Sales
  await prisma.productSales.createMany({
    data: [
      {
        productId: 'prod-001',
        productName: 'Wireless Headphones Pro',
        productSku: 'WH-PRO-001',
        period: 'DAILY',
        periodStart: today,
        quantity: 25,
        revenue: 6247.50,
      },
      {
        productId: 'prod-002',
        productName: 'Smart Watch Series 5',
        productSku: 'SW-S5-002',
        period: 'DAILY',
        periodStart: today,
        quantity: 15,
        revenue: 4500.00,
      },
      {
        productId: 'prod-003',
        productName: 'Laptop Stand Premium',
        productSku: 'LS-PRE-003',
        period: 'DAILY',
        periodStart: today,
        quantity: 10,
        revenue: 499.50,
      },
      {
        productId: 'prod-001',
        productName: 'Wireless Headphones Pro',
        productSku: 'WH-PRO-001',
        period: 'WEEKLY',
        periodStart: lastWeek,
        quantity: 180,
        revenue: 44982.00,
      },
      {
        productId: 'prod-002',
        productName: 'Smart Watch Series 5',
        productSku: 'SW-S5-002',
        period: 'WEEKLY',
        periodStart: lastWeek,
        quantity: 120,
        revenue: 36000.00,
      },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
