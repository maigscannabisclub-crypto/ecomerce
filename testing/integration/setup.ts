/**
 * Integration Tests Setup
 * Configuración inicial para tests de integración con testcontainers
 */
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { Client } from 'pg';
import amqp from 'amqplib';

// Global types
declare global {
  var testContainers: {
    postgres?: StartedTestContainer;
    rabbitmq?: StartedTestContainer;
    redis?: StartedTestContainer;
  };
  var testConnections: {
    postgres?: Client;
    rabbitmq?: amqp.Connection;
  };
}

// Test configuration
const TEST_CONFIG = {
  postgres: {
    image: 'postgres:15-alpine',
    ports: [5432],
    env: {
      POSTGRES_USER: 'test',
      POSTGRES_PASSWORD: 'test',
      POSTGRES_DB: 'ecommerce_test'
    },
    waitStrategy: Wait.forLogMessage('database system is ready to accept connections')
  },
  rabbitmq: {
    image: 'rabbitmq:3.12-alpine',
    ports: [5672, 15672],
    env: {
      RABBITMQ_DEFAULT_USER: 'test',
      RABBITMQ_DEFAULT_PASS: 'test'
    },
    waitStrategy: Wait.forLogMessage('Server startup complete')
  },
  redis: {
    image: 'redis:7-alpine',
    ports: [6379],
    waitStrategy: Wait.forLogMessage('Ready to accept connections')
  }
};

/**
 * Start PostgreSQL container
 */
async function startPostgres(): Promise<StartedTestContainer> {
  console.log('🐘 Starting PostgreSQL container...');
  
  const container = await new GenericContainer(TEST_CONFIG.postgres.image)
    .withExposedPorts(...TEST_CONFIG.postgres.ports)
    .withEnvironment(TEST_CONFIG.postgres.env)
    .withWaitStrategy(TEST_CONFIG.postgres.waitStrategy)
    .start();
  
  console.log(`✅ PostgreSQL started on port ${container.getMappedPort(5432)}`);
  return container;
}

/**
 * Start RabbitMQ container
 */
async function startRabbitMQ(): Promise<StartedTestContainer> {
  console.log('🐰 Starting RabbitMQ container...');
  
  const container = await new GenericContainer(TEST_CONFIG.rabbitmq.image)
    .withExposedPorts(...TEST_CONFIG.rabbitmq.ports)
    .withEnvironment(TEST_CONFIG.rabbitmq.env)
    .withWaitStrategy(TEST_CONFIG.rabbitmq.waitStrategy)
    .start();
  
  console.log(`✅ RabbitMQ started on port ${container.getMappedPort(5672)}`);
  return container;
}

/**
 * Start Redis container
 */
async function startRedis(): Promise<StartedTestContainer> {
  console.log('🔴 Starting Redis container...');
  
  const container = await new GenericContainer(TEST_CONFIG.redis.image)
    .withExposedPorts(...TEST_CONFIG.redis.ports)
    .withWaitStrategy(TEST_CONFIG.redis.waitStrategy)
    .start();
  
  console.log(`✅ Redis started on port ${container.getMappedPort(6379)}`);
  return container;
}

/**
 * Setup database schema
 */
async function setupDatabaseSchema(client: Client): Promise<void> {
  console.log('📊 Setting up database schema...');
  
  // Create tables for testing
  await client.query(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      role VARCHAR(20) DEFAULT 'customer',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Products table
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL(10, 2) NOT NULL,
      sku VARCHAR(100) UNIQUE NOT NULL,
      category_id UUID,
      stock_quantity INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Categories table
    CREATE TABLE IF NOT EXISTS categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      description TEXT,
      parent_id UUID REFERENCES categories(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Orders table
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      status VARCHAR(20) DEFAULT 'pending',
      total_amount DECIMAL(10, 2) NOT NULL,
      shipping_address JSONB,
      payment_status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Order items table
    CREATE TABLE IF NOT EXISTS order_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES orders(id),
      product_id UUID NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price DECIMAL(10, 2) NOT NULL,
      total_price DECIMAL(10, 2) NOT NULL
    );

    -- Cart table
    CREATE TABLE IF NOT EXISTS carts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id),
      session_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Cart items table
    CREATE TABLE IF NOT EXISTS cart_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      cart_id UUID NOT NULL REFERENCES carts(id),
      product_id UUID NOT NULL,
      quantity INTEGER NOT NULL,
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Inventory table
    CREATE TABLE IF NOT EXISTS inventory (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL UNIQUE,
      quantity INTEGER DEFAULT 0,
      reserved_quantity INTEGER DEFAULT 0,
      low_stock_threshold INTEGER DEFAULT 10,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);
  `);
  
  console.log('✅ Database schema created');
}

/**
 * Global setup - runs before all tests
 */
beforeAll(async () => {
  console.log('\n🚀 Starting integration test environment...\n');
  
  // Initialize global containers object
  global.testContainers = {};
  global.testConnections = {};
  
  try {
    // Start containers in parallel
    const [postgres, rabbitmq, redis] = await Promise.all([
      startPostgres(),
      startRabbitMQ(),
      startRedis()
    ]);
    
    global.testContainers.postgres = postgres;
    global.testContainers.rabbitmq = rabbitmq;
    global.testContainers.redis = redis;
    
    // Setup PostgreSQL connection
    const pgClient = new Client({
      host: postgres.getHost(),
      port: postgres.getMappedPort(5432),
      database: 'ecommerce_test',
      user: 'test',
      password: 'test'
    });
    
    await pgClient.connect();
    global.testConnections.postgres = pgClient;
    
    // Setup database schema
    await setupDatabaseSchema(pgClient);
    
    // Setup RabbitMQ connection
    const rabbitPort = rabbitmq.getMappedPort(5672);
    const rabbitConnection = await amqp.connect(
      `amqp://test:test@${rabbitmq.getHost()}:${rabbitPort}`
    );
    global.testConnections.rabbitmq = rabbitConnection;
    
    // Set environment variables for services
    process.env.DATABASE_URL = `postgresql://test:test@${postgres.getHost()}:${postgres.getMappedPort(5432)}/ecommerce_test`;
    process.env.RABBITMQ_URL = `amqp://test:test@${rabbitmq.getHost()}:${rabbitmq.getMappedPort(5672)}`;
    process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
    
    console.log('\n✅ Integration test environment ready\n');
    
  } catch (error) {
    console.error('❌ Failed to start test environment:', error);
    throw error;
  }
}, 120000);

/**
 * Global teardown - runs after all tests
 */
afterAll(async () => {
  console.log('\n🧹 Cleaning up integration test environment...\n');
  
  try {
    // Close connections
    if (global.testConnections.postgres) {
      await global.testConnections.postgres.end();
      console.log('✅ PostgreSQL connection closed');
    }
    
    if (global.testConnections.rabbitmq) {
      await global.testConnections.rabbitmq.close();
      console.log('✅ RabbitMQ connection closed');
    }
    
    // Stop containers
    const stopPromises = [];
    
    if (global.testContainers.postgres) {
      stopPromises.push(
        global.testContainers.postgres.stop()
          .then(() => console.log('✅ PostgreSQL container stopped'))
      );
    }
    
    if (global.testContainers.rabbitmq) {
      stopPromises.push(
        global.testContainers.rabbitmq.stop()
          .then(() => console.log('✅ RabbitMQ container stopped'))
      );
    }
    
    if (global.testContainers.redis) {
      stopPromises.push(
        global.testContainers.redis.stop()
          .then(() => console.log('✅ Redis container stopped'))
      );
    }
    
    await Promise.all(stopPromises);
    
    console.log('\n✅ Integration test environment cleaned up\n');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  }
}, 120000);

/**
 * Setup before each test
 */
beforeEach(async () => {
  // Clean up test data before each test
  if (global.testConnections.postgres) {
    await global.testConnections.postgres.query(`
      TRUNCATE TABLE cart_items, carts, order_items, orders, 
      inventory, products, categories, users 
      RESTART IDENTITY CASCADE;
    `);
  }
});

export {};
