import { PrismaClient, CartStatus } from '@prisma/client';
import { config } from '../../config';
import logger from '../../utils/logger';

// Extend PrismaClient to include custom methods
declare global {
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  const client = new PrismaClient({
    log: config.nodeEnv === 'development' 
      ? ['query', 'info', 'warn', 'error'] 
      : ['error'],
  });

  // Middleware for soft deletes and automatic updates
  client.$use(async (params, next) => {
    const before = Date.now();
    const result = await next(params);
    const after = Date.now();

    if (config.nodeEnv === 'development') {
      logger.debug(`Query ${params.model}.${params.action} took ${after - before}ms`);
    }

    return result;
  });

  return client;
};

export const prisma = globalThis.prisma ?? prismaClientSingleton();

if (config.nodeEnv !== 'production') {
  globalThis.prisma = prisma;
}

// Connection management
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected successfully');
  } catch (error) {
    logger.error('Error disconnecting from database:', error);
    throw error;
  }
}

// Health check
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  latency: number;
  message?: string;
}> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;
    return {
      healthy: true,
      latency,
    };
  } catch (error) {
    const latency = Date.now() - start;
    return {
      healthy: false,
      latency,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Cart repository helpers
export const cartRepository = {
  async findById(id: string) {
    return prisma.cart.findUnique({
      where: { id },
      include: { items: true },
    });
  },

  async findByUserId(userId: string) {
    return prisma.cart.findUnique({
      where: { userId },
      include: { items: true },
    });
  },

  async findActiveByUserId(userId: string) {
    return prisma.cart.findFirst({
      where: {
        userId,
        status: CartStatus.ACTIVE,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: { items: true },
    });
  },

  async create(userId: string, expiresAt: Date) {
    return prisma.cart.create({
      data: {
        userId,
        expiresAt,
        status: CartStatus.ACTIVE,
        total: 0,
      },
      include: { items: true },
    });
  },

  async updateCart(cartId: string, data: {
    total?: number;
    status?: CartStatus;
    expiresAt?: Date;
  }) {
    return prisma.cart.update({
      where: { id: cartId },
      data,
      include: { items: true },
    });
  },

  async addItem(cartId: string, item: {
    productId: string;
    productName: string;
    productSku: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }) {
    return prisma.cartItem.create({
      data: {
        ...item,
        cartId,
      },
    });
  },

  async updateItem(itemId: string, data: {
    quantity?: number;
    subtotal?: number;
  }) {
    return prisma.cartItem.update({
      where: { id: itemId },
      data,
    });
  },

  async deleteItem(itemId: string) {
    return prisma.cartItem.delete({
      where: { id: itemId },
    });
  },

  async deleteAllItems(cartId: string) {
    return prisma.cartItem.deleteMany({
      where: { cartId },
    });
  },

  async deleteCart(cartId: string) {
    return prisma.cart.delete({
      where: { id: cartId },
    });
  },

  async findExpiredCarts() {
    return prisma.cart.findMany({
      where: {
        status: CartStatus.ACTIVE,
        expiresAt: {
          lt: new Date(),
        },
      },
      include: { items: true },
    });
  },

  async updateExpiredCarts() {
    return prisma.cart.updateMany({
      where: {
        status: CartStatus.ACTIVE,
        expiresAt: {
          lt: new Date(),
        },
      },
      data: {
        status: CartStatus.EXPIRED,
      },
    });
  },

  async upsertItem(cartId: string, item: {
    productId: string;
    productName: string;
    productSku: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }) {
    return prisma.cartItem.upsert({
      where: {
        cartId_productId: {
          cartId,
          productId: item.productId,
        },
      },
      update: {
        quantity: item.quantity,
        subtotal: item.subtotal,
      },
      create: {
        ...item,
        cartId,
      },
    });
  },
};

export default prisma;
