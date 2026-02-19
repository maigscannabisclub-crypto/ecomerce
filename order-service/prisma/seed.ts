import { PrismaClient, OrderStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create sample orders for development/testing
  const sampleOrders = [
    {
      orderNumber: 'ORD-2024-000001',
      userId: 'user-1',
      userEmail: 'customer1@example.com',
      status: OrderStatus.DELIVERED,
      total: 199.99,
      tax: 20.00,
      shipping: 15.00,
      grandTotal: 234.99,
      shippingAddress: {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'USA'
      },
      billingAddress: {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'USA'
      },
      items: {
        create: [
          {
            productId: 'prod-1',
            productName: 'Wireless Headphones',
            productSku: 'WH-001',
            quantity: 1,
            unitPrice: 199.99,
            subtotal: 199.99
          }
        ]
      },
      statusHistory: {
        create: [
          { status: OrderStatus.PENDING, previousStatus: null, notes: 'Order created', createdBy: 'system' },
          { status: OrderStatus.RESERVED, previousStatus: OrderStatus.PENDING, notes: 'Stock reserved', createdBy: 'system' },
          { status: OrderStatus.CONFIRMED, previousStatus: OrderStatus.RESERVED, notes: 'Order confirmed', createdBy: 'system' },
          { status: OrderStatus.PAID, previousStatus: OrderStatus.CONFIRMED, notes: 'Payment received', createdBy: 'system' },
          { status: OrderStatus.SHIPPED, previousStatus: OrderStatus.PAID, notes: 'Order shipped', createdBy: 'system' },
          { status: OrderStatus.DELIVERED, previousStatus: OrderStatus.SHIPPED, notes: 'Order delivered', createdBy: 'system' }
        ]
      }
    },
    {
      orderNumber: 'ORD-2024-000002',
      userId: 'user-2',
      userEmail: 'customer2@example.com',
      status: OrderStatus.PAID,
      total: 599.98,
      tax: 60.00,
      shipping: 25.00,
      grandTotal: 684.98,
      shippingAddress: {
        street: '456 Oak Ave',
        city: 'Los Angeles',
        state: 'CA',
        zipCode: '90001',
        country: 'USA'
      },
      billingAddress: {
        street: '456 Oak Ave',
        city: 'Los Angeles',
        state: 'CA',
        zipCode: '90001',
        country: 'USA'
      },
      items: {
        create: [
          {
            productId: 'prod-2',
            productName: 'Smart Watch',
            productSku: 'SW-002',
            quantity: 2,
            unitPrice: 299.99,
            subtotal: 599.98
          }
        ]
      },
      statusHistory: {
        create: [
          { status: OrderStatus.PENDING, previousStatus: null, notes: 'Order created', createdBy: 'system' },
          { status: OrderStatus.RESERVED, previousStatus: OrderStatus.PENDING, notes: 'Stock reserved', createdBy: 'system' },
          { status: OrderStatus.CONFIRMED, previousStatus: OrderStatus.RESERVED, notes: 'Order confirmed', createdBy: 'system' },
          { status: OrderStatus.PAID, previousStatus: OrderStatus.CONFIRMED, notes: 'Payment received', createdBy: 'system' }
        ]
      }
    },
    {
      orderNumber: 'ORD-2024-000003',
      userId: 'user-1',
      userEmail: 'customer1@example.com',
      status: OrderStatus.PENDING,
      total: 89.99,
      tax: 9.00,
      shipping: 10.00,
      grandTotal: 108.99,
      shippingAddress: {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'USA'
      },
      billingAddress: {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'USA'
      },
      items: {
        create: [
          {
            productId: 'prod-3',
            productName: 'Phone Case',
            productSku: 'PC-003',
            quantity: 3,
            unitPrice: 29.99,
            subtotal: 89.97
          }
        ]
      },
      statusHistory: {
        create: [
          { status: OrderStatus.PENDING, previousStatus: null, notes: 'Order created', createdBy: 'system' }
        ]
      }
    },
    {
      orderNumber: 'ORD-2024-000004',
      userId: 'user-3',
      userEmail: 'customer3@example.com',
      status: OrderStatus.CANCELLED,
      total: 1299.99,
      tax: 130.00,
      shipping: 0.00,
      grandTotal: 1429.99,
      shippingAddress: {
        street: '789 Pine Rd',
        city: 'Chicago',
        state: 'IL',
        zipCode: '60001',
        country: 'USA'
      },
      billingAddress: {
        street: '789 Pine Rd',
        city: 'Chicago',
        state: 'IL',
        zipCode: '60001',
        country: 'USA'
      },
      items: {
        create: [
          {
            productId: 'prod-4',
            productName: 'Laptop Stand',
            productSku: 'LS-004',
            quantity: 1,
            unitPrice: 1299.99,
            subtotal: 1299.99
          }
        ]
      },
      statusHistory: {
        create: [
          { status: OrderStatus.PENDING, previousStatus: null, notes: 'Order created', createdBy: 'system' },
          { status: OrderStatus.FAILED, previousStatus: OrderStatus.PENDING, notes: 'Stock reservation failed', createdBy: 'system' },
          { status: OrderStatus.CANCELLED, previousStatus: OrderStatus.FAILED, notes: 'Order cancelled by customer', createdBy: 'user-3' }
        ]
      }
    }
  ];

  for (const orderData of sampleOrders) {
    await prisma.order.create({
      data: orderData
    });
  }

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
