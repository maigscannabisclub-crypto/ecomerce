/**
 * Database Integration Tests
 * Pruebas de integración con PostgreSQL usando testcontainers
 */
import { Client } from 'pg';

describe('Database Integration Tests', () => {
  let client: Client;

  beforeEach(() => {
    client = global.testConnections.postgres!;
  });

  describe('Connection', () => {
    it('should connect to PostgreSQL database', async () => {
      const result = await client.query('SELECT NOW() as now');
      expect(result.rows[0].now).toBeDefined();
    });

    it('should have correct database name', async () => {
      const result = await client.query('SELECT current_database() as db');
      expect(result.rows[0].db).toBe('ecommerce_test');
    });
  });

  describe('Users Table', () => {
    it('should create a new user', async () => {
      const result = await client.query(`
        INSERT INTO users (email, password_hash, first_name, last_name, role)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, ['test@example.com', 'hashed_password', 'John', 'Doe', 'customer']);

      expect(result.rows[0]).toMatchObject({
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        role: 'customer',
        is_active: true
      });
      expect(result.rows[0].id).toBeDefined();
    });

    it('should enforce unique email constraint', async () => {
      await client.query(`
        INSERT INTO users (email, password_hash)
        VALUES ('unique@example.com', 'password')
      `);

      await expect(
        client.query(`
          INSERT INTO users (email, password_hash)
          VALUES ('unique@example.com', 'password2')
        `)
      ).rejects.toThrow();
    });

    it('should retrieve user by email', async () => {
      await client.query(`
        INSERT INTO users (email, password_hash, first_name, last_name)
        VALUES ('find@example.com', 'password', 'Jane', 'Smith')
      `);

      const result = await client.query(`
        SELECT * FROM users WHERE email = $1
      `, ['find@example.com']);

      expect(result.rows[0].first_name).toBe('Jane');
      expect(result.rows[0].last_name).toBe('Smith');
    });

    it('should update user information', async () => {
      const insert = await client.query(`
        INSERT INTO users (email, password_hash, first_name)
        VALUES ('update@example.com', 'password', 'Old')
        RETURNING id
      `);

      const userId = insert.rows[0].id;

      await client.query(`
        UPDATE users SET first_name = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, ['New', userId]);

      const result = await client.query(`
        SELECT * FROM users WHERE id = $1
      `, [userId]);

      expect(result.rows[0].first_name).toBe('New');
    });

    it('should soft delete user', async () => {
      const insert = await client.query(`
        INSERT INTO users (email, password_hash)
        VALUES ('delete@example.com', 'password')
        RETURNING id
      `);

      const userId = insert.rows[0].id;

      await client.query(`
        UPDATE users SET is_active = false WHERE id = $1
      `, [userId]);

      const result = await client.query(`
        SELECT * FROM users WHERE id = $1
      `, [userId]);

      expect(result.rows[0].is_active).toBe(false);
    });
  });

  describe('Products Table', () => {
    it('should create a new product', async () => {
      const result = await client.query(`
        INSERT INTO products (name, description, price, sku, stock_quantity)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, ['Test Product', 'A test product', 99.99, 'TEST-001', 100]);

      expect(result.rows[0]).toMatchObject({
        name: 'Test Product',
        description: 'A test product',
        price: '99.99',
        sku: 'TEST-001',
        stock_quantity: 100
      });
    });

    it('should enforce unique SKU constraint', async () => {
      await client.query(`
        INSERT INTO products (name, price, sku)
        VALUES ('Product 1', 10.00, 'UNIQUE-SKU')
      `);

      await expect(
        client.query(`
          INSERT INTO products (name, price, sku)
          VALUES ('Product 2', 20.00, 'UNIQUE-SKU')
        `)
      ).rejects.toThrow();
    });

    it('should update product stock', async () => {
      const insert = await client.query(`
        INSERT INTO products (name, price, sku, stock_quantity)
        VALUES ('Stock Product', 50.00, 'STOCK-001', 100)
        RETURNING id
      `);

      const productId = insert.rows[0].id;

      await client.query(`
        UPDATE products 
        SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [10, productId]);

      const result = await client.query(`
        SELECT stock_quantity FROM products WHERE id = $1
      `, [productId]);

      expect(result.rows[0].stock_quantity).toBe(90);
    });

    it('should find products by price range', async () => {
      await client.query(`
        INSERT INTO products (name, price, sku) VALUES
        ('Cheap', 10.00, 'CHEAP-001'),
        ('Medium', 50.00, 'MED-001'),
        ('Expensive', 100.00, 'EXP-001')
      `);

      const result = await client.query(`
        SELECT * FROM products 
        WHERE price BETWEEN $1 AND $2
        ORDER BY price
      `, [20, 80]);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Medium');
    });
  });

  describe('Orders Table', () => {
    beforeEach(async () => {
      // Create test user for orders
      await client.query(`
        INSERT INTO users (id, email, password_hash)
        VALUES ('550e8400-e29b-41d4-a716-446655440000', 'order@example.com', 'password')
      `);
    });

    it('should create a new order', async () => {
      const result = await client.query(`
        INSERT INTO orders (user_id, status, total_amount, shipping_address)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [
        '550e8400-e29b-41d4-a716-446655440000',
        'pending',
        150.00,
        JSON.stringify({ street: '123 Test St', city: 'Test City' })
      ]);

      expect(result.rows[0]).toMatchObject({
        status: 'pending',
        total_amount: '150.00',
        payment_status: 'pending'
      });
      expect(result.rows[0].shipping_address).toEqual({
        street: '123 Test St',
        city: 'Test City'
      });
    });

    it('should create order with items', async () => {
      const orderResult = await client.query(`
        INSERT INTO orders (user_id, status, total_amount)
        VALUES ($1, $2, $3)
        RETURNING id
      `, ['550e8400-e29b-41d4-a716-446655440000', 'pending', 200.00]);

      const orderId = orderResult.rows[0].id;

      await client.query(`
        INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price)
        VALUES 
          ($1, '550e8400-e29b-41d4-a716-446655440001', 2, 50.00, 100.00),
          ($1, '550e8400-e29b-41d4-a716-446655440002', 1, 100.00, 100.00)
      `, [orderId]);

      const itemsResult = await client.query(`
        SELECT * FROM order_items WHERE order_id = $1
      `, [orderId]);

      expect(itemsResult.rows).toHaveLength(2);
    });

    it('should update order status', async () => {
      const orderResult = await client.query(`
        INSERT INTO orders (user_id, status, total_amount)
        VALUES ($1, $2, $3)
        RETURNING id
      `, ['550e8400-e29b-41d4-a716-446655440000', 'pending', 100.00]);

      const orderId = orderResult.rows[0].id;

      await client.query(`
        UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, ['confirmed', orderId]);

      const result = await client.query(`
        SELECT status FROM orders WHERE id = $1
      `, [orderId]);

      expect(result.rows[0].status).toBe('confirmed');
    });

    it('should get orders by user', async () => {
      await client.query(`
        INSERT INTO orders (user_id, status, total_amount) VALUES
        ('550e8400-e29b-41d4-a716-446655440000', 'pending', 100.00),
        ('550e8400-e29b-41d4-a716-446655440000', 'confirmed', 200.00)
      `);

      const result = await client.query(`
        SELECT * FROM orders WHERE user_id = $1
      `, ['550e8400-e29b-41d4-a716-446655440000']);

      expect(result.rows).toHaveLength(2);
    });
  });

  describe('Cart Table', () => {
    it('should create a cart for user', async () => {
      const userResult = await client.query(`
        INSERT INTO users (email, password_hash)
        VALUES ('cart@example.com', 'password')
        RETURNING id
      `);

      const userId = userResult.rows[0].id;

      const cartResult = await client.query(`
        INSERT INTO carts (user_id)
        VALUES ($1)
        RETURNING *
      `, [userId]);

      expect(cartResult.rows[0].user_id).toBe(userId);
    });

    it('should add items to cart', async () => {
      const cartResult = await client.query(`
        INSERT INTO carts (session_id)
        VALUES ('test-session')
        RETURNING id
      `);

      const cartId = cartResult.rows[0].id;

      await client.query(`
        INSERT INTO cart_items (cart_id, product_id, quantity)
        VALUES 
          ($1, '550e8400-e29b-41d4-a716-446655440001', 2),
          ($1, '550e8400-e29b-41d4-a716-446655440002', 1)
      `, [cartId]);

      const itemsResult = await client.query(`
        SELECT * FROM cart_items WHERE cart_id = $1
      `, [cartId]);

      expect(itemsResult.rows).toHaveLength(2);
    });

    it('should update cart item quantity', async () => {
      const cartResult = await client.query(`
        INSERT INTO carts (session_id)
        VALUES ('test-session-2')
        RETURNING id
      `);

      const cartId = cartResult.rows[0].id;

      const itemResult = await client.query(`
        INSERT INTO cart_items (cart_id, product_id, quantity)
        VALUES ($1, '550e8400-e29b-41d4-a716-446655440001', 1)
        RETURNING id
      `, [cartId]);

      const itemId = itemResult.rows[0].id;

      await client.query(`
        UPDATE cart_items SET quantity = $1 WHERE id = $2
      `, [5, itemId]);

      const result = await client.query(`
        SELECT quantity FROM cart_items WHERE id = $1
      `, [itemId]);

      expect(result.rows[0].quantity).toBe(5);
    });

    it('should remove item from cart', async () => {
      const cartResult = await client.query(`
        INSERT INTO carts (session_id)
        VALUES ('test-session-3')
        RETURNING id
      `);

      const cartId = cartResult.rows[0].id;

      const itemResult = await client.query(`
        INSERT INTO cart_items (cart_id, product_id, quantity)
        VALUES ($1, '550e8400-e29b-41d4-a716-446655440001', 1)
        RETURNING id
      `, [cartId]);

      const itemId = itemResult.rows[0].id;

      await client.query(`DELETE FROM cart_items WHERE id = $1`, [itemId]);

      const result = await client.query(`
        SELECT * FROM cart_items WHERE cart_id = $1
      `, [cartId]);

      expect(result.rows).toHaveLength(0);
    });
  });

  describe('Inventory Table', () => {
    it('should create inventory record for product', async () => {
      const result = await client.query(`
        INSERT INTO inventory (product_id, quantity, low_stock_threshold)
        VALUES ($1, $2, $3)
        RETURNING *
      `, ['550e8400-e29b-41d4-a716-446655440001', 100, 10]);

      expect(result.rows[0]).toMatchObject({
        product_id: '550e8400-e29b-41d4-a716-446655440001',
        quantity: 100,
        low_stock_threshold: 10,
        reserved_quantity: 0
      });
    });

    it('should reserve inventory', async () => {
      await client.query(`
        INSERT INTO inventory (product_id, quantity, reserved_quantity)
        VALUES ('550e8400-e29b-41d4-a716-446655440001', 100, 0)
      `);

      await client.query(`
        UPDATE inventory 
        SET quantity = quantity - $1, reserved_quantity = reserved_quantity + $1
        WHERE product_id = $2
      `, [10, '550e8400-e29b-41d4-a716-446655440001']);

      const result = await client.query(`
        SELECT * FROM inventory WHERE product_id = $1
      `, ['550e8400-e29b-41d4-a716-446655440001']);

      expect(result.rows[0].quantity).toBe(90);
      expect(result.rows[0].reserved_quantity).toBe(10);
    });

    it('should identify low stock items', async () => {
      await client.query(`
        INSERT INTO inventory (product_id, quantity, low_stock_threshold) VALUES
        ('550e8400-e29b-41d4-a716-446655440001', 5, 10),
        ('550e8400-e29b-41d4-a716-446655440002', 50, 10),
        ('550e8400-e29b-41d4-a716-446655440003', 8, 10)
      `);

      const result = await client.query(`
        SELECT * FROM inventory WHERE quantity <= low_stock_threshold
      `);

      expect(result.rows).toHaveLength(2);
    });
  });

  describe('Transactions', () => {
    it('should handle successful transaction', async () => {
      await client.query('BEGIN');

      try {
        await client.query(`
          INSERT INTO users (email, password_hash)
          VALUES ('transaction@example.com', 'password')
        `);

        await client.query(`
          INSERT INTO products (name, price, sku)
          VALUES ('Transaction Product', 99.99, 'TRANS-001')
        `);

        await client.query('COMMIT');

        const userResult = await client.query(`
          SELECT * FROM users WHERE email = 'transaction@example.com'
        `);
        expect(userResult.rows).toHaveLength(1);

        const productResult = await client.query(`
          SELECT * FROM products WHERE sku = 'TRANS-001'
        `);
        expect(productResult.rows).toHaveLength(1);

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });

    it('should rollback transaction on error', async () => {
      await client.query(`
        INSERT INTO products (name, price, sku)
        VALUES ('Existing', 10.00, 'EXISTING-SKU')
      `);

      await client.query('BEGIN');

      try {
        await client.query(`
          INSERT INTO products (name, price, sku)
          VALUES ('New', 20.00, 'NEW-SKU')
        `);

        // This should fail due to unique constraint
        await client.query(`
          INSERT INTO products (name, price, sku)
          VALUES ('Duplicate', 30.00, 'EXISTING-SKU')
        `);

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
      }

      // Verify the new product was not inserted
      const result = await client.query(`
        SELECT * FROM products WHERE sku = 'NEW-SKU'
      `);
      expect(result.rows).toHaveLength(0);
    });
  });

  describe('Performance', () => {
    it('should handle bulk inserts efficiently', async () => {
      const startTime = Date.now();

      const values = Array.from({ length: 1000 }, (_, i) => 
        `('user${i}@example.com', 'password${i}')`
      ).join(',');

      await client.query(`
        INSERT INTO users (email, password_hash)
        VALUES ${values}
      `);

      const duration = Date.now() - startTime;

      const result = await client.query('SELECT COUNT(*) FROM users');
      expect(parseInt(result.rows[0].count)).toBe(1000);
      expect(duration).toBeLessThan(5000); // Should complete in less than 5 seconds
    });

    it('should use indexes effectively', async () => {
      // Insert test data
      await client.query(`
        INSERT INTO products (name, price, sku, category_id) VALUES
        ('Product 1', 10.00, 'PERF-001', '550e8400-e29b-41d4-a716-446655440000'),
        ('Product 2', 20.00, 'PERF-002', '550e8400-e29b-41d4-a716-446655440000'),
        ('Product 3', 30.00, 'PERF-003', '550e8400-e29b-41d4-a716-446655440001')
      `);

      const explainResult = await client.query(`
        EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
        SELECT * FROM products WHERE sku = 'PERF-001'
      `);

      const plan = explainResult.rows[0]['QUERY PLAN'][0];
      expect(plan['Plan']['Node Type']).toBe('Index Scan');
    });
  });
});
