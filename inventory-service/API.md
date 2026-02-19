# Inventory Service API Documentation

## Base URL

```
http://localhost:3005/api/v1
```

## Authentication

Todas las rutas protegidas requieren un token JWT en el header:

```
Authorization: Bearer <token>
```

### Generar Token (para testing)

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "password"}'
```

## Endpoints

### Health Check

#### GET /health

Verifica el estado del servicio.

**Response:**
```json
{
  "success": true,
  "data": {
    "service": "inventory-service",
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "version": "1.0.0",
    "checks": {
      "database": {
        "status": "up",
        "latency": "5ms"
      },
      "rabbitmq": {
        "status": "up"
      }
    }
  }
}
```

---

### Inventory Management

#### GET /inventory

Lista todo el inventario con paginación.

**Query Parameters:**
- `page` (number, optional): Número de página (default: 1)
- `limit` (number, optional): Items por página (default: 20, max: 100)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "inv-001",
      "productId": "prod-001",
      "sku": "SKU-001",
      "quantity": 100,
      "reserved": 10,
      "available": 90,
      "minStock": 10,
      "reorderPoint": 20,
      "location": "WAREHOUSE-A",
      "isLowStock": false,
      "needsReorder": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

---

#### POST /inventory

Crea un nuevo registro de inventario (ADMIN only).

**Request Body:**
```json
{
  "productId": "prod-001",
  "sku": "SKU-001",
  "quantity": 100,
  "minStock": 10,
  "reorderPoint": 20,
  "location": "WAREHOUSE-A"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "inv-001",
    "productId": "prod-001",
    "sku": "SKU-001",
    "quantity": 100,
    "reserved": 0,
    "available": 100,
    "minStock": 10,
    "reorderPoint": 20,
    "location": "WAREHOUSE-A",
    "isLowStock": false,
    "needsReorder": false,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "Inventory created successfully"
}
```

---

#### GET /inventory/:productId

Obtiene el inventario de un producto específico.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "inv-001",
    "productId": "prod-001",
    "sku": "SKU-001",
    "quantity": 100,
    "reserved": 10,
    "available": 90,
    "minStock": 10,
    "reorderPoint": 20,
    "location": "WAREHOUSE-A",
    "isLowStock": false,
    "needsReorder": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

#### GET /inventory/sku/:sku

Obtiene el inventario por SKU.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "inv-001",
    "productId": "prod-001",
    "sku": "SKU-001",
    "quantity": 100,
    "reserved": 10,
    "available": 90,
    "minStock": 10,
    "reorderPoint": 20,
    "location": "WAREHOUSE-A",
    "isLowStock": false,
    "needsReorder": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

---

#### PATCH /inventory/:productId

Actualiza la configuración de inventario (ADMIN only).

**Request Body:**
```json
{
  "minStock": 15,
  "reorderPoint": 25,
  "location": "WAREHOUSE-B"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "inv-001",
    "productId": "prod-001",
    "sku": "SKU-001",
    "quantity": 100,
    "reserved": 10,
    "available": 90,
    "minStock": 15,
    "reorderPoint": 25,
    "location": "WAREHOUSE-B",
    "isLowStock": false,
    "needsReorder": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "Inventory updated successfully"
}
```

---

#### DELETE /inventory/:productId

Elimina un registro de inventario (ADMIN only).

**Response:**
```json
{
  "success": true,
  "message": "Inventory deleted successfully"
}
```

---

### Stock Operations

#### POST /inventory/:productId/reserve

Reserva stock para una orden.

**Request Body:**
```json
{
  "quantity": 10,
  "orderId": "order-001"
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "success": true,
    "productId": "prod-001",
    "requestedQuantity": 10,
    "reservedQuantity": 10,
    "availableStock": 80,
    "orderId": "order-001",
    "message": "Stock reserved successfully"
  },
  "message": "Stock reserved successfully"
}
```

**Response (Insufficient Stock):**
```json
{
  "success": false,
  "error": "Insufficient stock. Available: 5, Requested: 10",
  "code": "STOCK_RESERVATION_FAILED",
  "data": {
    "success": false,
    "productId": "prod-001",
    "requestedQuantity": 10,
    "reservedQuantity": 0,
    "availableStock": 5,
    "orderId": "order-001",
    "message": "Insufficient stock. Available: 5, Requested: 10"
  }
}
```

---

#### POST /inventory/:productId/release

Libera stock reservado.

**Request Body:**
```json
{
  "quantity": 10,
  "orderId": "order-001"
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "success": true,
    "productId": "prod-001",
    "releasedQuantity": 10,
    "orderId": "order-001",
    "message": "Stock released successfully"
  },
  "message": "Stock released successfully"
}
```

---

#### POST /inventory/:productId/adjust

Ajusta el stock (ADMIN only).

**Request Body (IN):**
```json
{
  "quantity": 20,
  "reason": "Stock received from supplier",
  "type": "IN"
}
```

**Request Body (OUT):**
```json
{
  "quantity": 20,
  "reason": "Stock sent to store",
  "type": "OUT"
}
```

**Request Body (ADJUSTMENT):**
```json
{
  "quantity": 150,
  "reason": "Inventory count adjustment",
  "type": "ADJUSTMENT"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "productId": "prod-001",
    "previousQuantity": 100,
    "newQuantity": 120,
    "adjustment": 20,
    "type": "IN",
    "reason": "Stock received from supplier",
    "message": "Stock adjusted successfully"
  },
  "message": "Stock adjusted successfully"
}
```

---

### Batch Operations

#### POST /inventory/batch/reserve

Reserva stock para múltiples productos.

**Request Body:**
```json
{
  "items": [
    { "productId": "prod-001", "quantity": 5 },
    { "productId": "prod-002", "quantity": 3 },
    { "productId": "prod-003", "quantity": 2 }
  ],
  "orderId": "order-001"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "successful": [
      {
        "success": true,
        "productId": "prod-001",
        "requestedQuantity": 5,
        "reservedQuantity": 5,
        "availableStock": 95,
        "orderId": "order-001",
        "message": "Stock reserved successfully"
      }
    ],
    "failed": [],
    "total": 3
  },
  "message": "All stock reservations successful"
}
```

---

#### POST /inventory/batch/release

Libera stock para múltiples productos.

**Request Body:**
```json
{
  "items": [
    { "productId": "prod-001", "quantity": 5 },
    { "productId": "prod-002", "quantity": 3 }
  ],
  "orderId": "order-001"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "successful": [
      {
        "success": true,
        "productId": "prod-001",
        "releasedQuantity": 5,
        "orderId": "order-001",
        "message": "Stock released successfully"
      }
    ],
    "failed": [],
    "total": 2
  },
  "message": "All stock releases successful"
}
```

---

### Queries

#### GET /inventory/:productId/movements

Obtiene el historial de movimientos de un producto (ADMIN only).

**Response:**
```json
{
  "success": true,
  "data": {
    "productId": "prod-001",
    "sku": "SKU-001",
    "movements": [
      {
        "id": "mov-001",
        "inventoryId": "inv-001",
        "type": "IN",
        "quantity": 100,
        "reason": "Initial stock entry",
        "orderId": null,
        "createdAt": "2024-01-01T00:00:00.000Z"
      },
      {
        "id": "mov-002",
        "inventoryId": "inv-001",
        "type": "RESERVE",
        "quantity": 10,
        "reason": "Stock reserved for order order-001",
        "orderId": "order-001",
        "createdAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "totalMovements": 2
  }
}
```

---

#### GET /inventory/alerts/low-stock

Obtiene las alertas de stock bajo (ADMIN only).

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "productId": "prod-001",
      "sku": "SKU-001",
      "currentStock": 5,
      "minStock": 10,
      "reorderPoint": 20,
      "location": "WAREHOUSE-A",
      "alertType": "LOW_STOCK"
    },
    {
      "productId": "prod-002",
      "sku": "SKU-002",
      "currentStock": 2,
      "minStock": 10,
      "reorderPoint": 20,
      "location": "WAREHOUSE-B",
      "alertType": "CRITICAL_STOCK"
    }
  ],
  "count": 2
}
```

---

## Error Responses

### 400 Bad Request

```json
{
  "success": false,
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "quantity",
      "message": "Quantity must be at least 1"
    }
  ]
}
```

### 401 Unauthorized

```json
{
  "success": false,
  "error": "Access token required",
  "code": "TOKEN_MISSING"
}
```

### 403 Forbidden

```json
{
  "success": false,
  "error": "Insufficient permissions",
  "code": "FORBIDDEN",
  "requiredRoles": ["admin"]
}
```

### 404 Not Found

```json
{
  "success": false,
  "error": "Inventory not found",
  "code": "INVENTORY_NOT_FOUND"
}
```

### 409 Conflict

```json
{
  "success": false,
  "error": "Insufficient stock. Available: 5, Requested: 10",
  "code": "STOCK_RESERVATION_FAILED"
}
```

### 429 Too Many Requests

```json
{
  "success": false,
  "error": "Too many requests, please try again later",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 900
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "error": "Internal server error",
  "code": "INTERNAL_ERROR"
}
```

---

## Event Schema

### StockReserved

```json
{
  "eventId": "evt-001",
  "eventType": "StockReserved",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "payload": {
    "productId": "prod-001",
    "sku": "SKU-001",
    "quantity": 10,
    "orderId": "order-001",
    "availableStock": 80
  }
}
```

### StockReleased

```json
{
  "eventId": "evt-002",
  "eventType": "StockReleased",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "payload": {
    "productId": "prod-001",
    "sku": "SKU-001",
    "quantity": 10,
    "orderId": "order-001",
    "availableStock": 90
  }
}
```

### LowStockAlert

```json
{
  "eventId": "evt-003",
  "eventType": "LowStockAlert",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "payload": {
    "productId": "prod-001",
    "sku": "SKU-001",
    "currentStock": 5,
    "minStock": 10,
    "reorderPoint": 20,
    "location": "WAREHOUSE-A",
    "alertType": "LOW_STOCK"
  }
}
```
