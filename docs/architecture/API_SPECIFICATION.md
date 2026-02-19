# Especificación de APIs

## Índice
1. [Visión General](#visión-general)
2. [API Gateway](#api-gateway)
3. [Auth Service API](#auth-service-api)
4. [Product Service API](#product-service-api)
5. [Cart Service API](#cart-service-api)
6. [Order Service API](#order-service-api)
7. [Inventory Service API](#inventory-service-api)
8. [Common Patterns](#common-patterns)

---

## Visión General

### Base URLs

| Entorno | URL Base |
|---------|----------|
| Development | `http://localhost:3000` |
| Staging | `https://api-staging.ecommerce.com` |
| Production | `https://api.ecommerce.com` |

### Versionado

Las APIs usan versionado en la URL:
```
/api/v1/products
/api/v2/products
```

### Formatos

- **Request/Response**: JSON
- **Encoding**: UTF-8
- **Content-Type**: `application/json`
- **Dates**: ISO 8601 (e.g., `2024-01-15T10:30:00Z`)
- **Currency**: Decimal con 2 decimales

### Autenticación

```
Authorization: Bearer {access_token}
```

### Rate Limiting

| Endpoint Type | Limit |
|--------------|-------|
| Public | 100 req/min |
| Authenticated | 1000 req/min |
| Admin | 5000 req/min |

Headers de respuesta:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

### Respuestas de Error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ],
    "requestId": "req-550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### Códigos de Error

| Código | HTTP Status | Descripción |
|--------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Request mal formado |
| `VALIDATION_ERROR` | 400 | Datos de entrada inválidos |
| `UNAUTHORIZED` | 401 | No autenticado |
| `FORBIDDEN` | 403 | No autorizado |
| `NOT_FOUND` | 404 | Recurso no encontrado |
| `CONFLICT` | 409 | Conflicto de estado |
| `RATE_LIMITED` | 429 | Rate limit excedido |
| `INTERNAL_ERROR` | 500 | Error interno del servidor |
| `SERVICE_UNAVAILABLE` | 503 | Servicio no disponible |

---

## API Gateway

### Endpoints Públicos

#### Health Check
```http
GET /health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0.0",
  "services": {
    "auth": "healthy",
    "product": "healthy",
    "cart": "healthy",
    "order": "healthy",
    "inventory": "healthy"
  }
}
```

### Endpoints de Autenticación (Proxy a Auth Service)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Registrar usuario |
| POST | `/api/v1/auth/login` | Iniciar sesión |
| POST | `/api/v1/auth/refresh` | Refrescar token |
| POST | `/api/v1/auth/logout` | Cerrar sesión |
| POST | `/api/v1/auth/forgot-password` | Recuperar contraseña |
| POST | `/api/v1/auth/reset-password` | Resetear contraseña |

---

## Auth Service API

### Base URL
```
http://localhost:3001
```

### Endpoints

#### Registrar Usuario
```http
POST /api/v1/auth/register
```

Request:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890"
}
```

Response (201):
```json
{
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "createdAt": "2024-01-15T10:30:00Z"
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 3600
  }
}
```

#### Iniciar Sesión
```http
POST /api/v1/auth/login
```

Request:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

Response (200):
```json
{
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "roles": ["customer"]
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 3600
  }
}
```

#### Refrescar Token
```http
POST /api/v1/auth/refresh
```

Request:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

Response (200):
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 3600
}
```

#### Obtener Perfil
```http
GET /api/v1/auth/profile
Authorization: Bearer {access_token}
```

Response (200):
```json
{
  "id": "user-123",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "avatar": "https://cdn.example.com/avatars/user-123.jpg",
  "roles": ["customer"],
  "preferences": {
    "language": "en",
    "currency": "USD",
    "notifications": {
      "email": true,
      "sms": false,
      "push": true
    }
  },
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

#### Actualizar Perfil
```http
PUT /api/v1/auth/profile
Authorization: Bearer {access_token}
```

Request:
```json
{
  "firstName": "John",
  "lastName": "Doe Updated",
  "phone": "+0987654321",
  "preferences": {
    "language": "es",
    "currency": "EUR"
  }
}
```

#### Cambiar Contraseña
```http
POST /api/v1/auth/change-password
Authorization: Bearer {access_token}
```

Request:
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass456!"
}
```

---

## Product Service API

### Base URL
```
http://localhost:3002
```

### Endpoints

#### Listar Productos
```http
GET /api/v1/products
```

Query Parameters:
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `page` | integer | Número de página (default: 1) |
| `limit` | integer | Items por página (default: 20, max: 100) |
| `category` | string | Filtrar por categoría |
| `brand` | string | Filtrar por marca |
| `minPrice` | decimal | Precio mínimo |
| `maxPrice` | decimal | Precio máximo |
| `search` | string | Búsqueda por nombre/descripción |
| `sort` | string | Ordenamiento (price_asc, price_desc, name, newest) |
| `inStock` | boolean | Solo productos en stock |

Response (200):
```json
{
  "data": [
    {
      "id": "prod-456",
      "sku": "SKU-12345",
      "name": "Wireless Headphones",
      "slug": "wireless-headphones",
      "description": "High-quality wireless headphones with noise cancellation",
      "shortDescription": "Premium wireless headphones",
      "price": {
        "amount": 99.99,
        "currency": "USD",
        "compareAt": 129.99
      },
      "images": [
        {
          "url": "https://cdn.example.com/products/prod-456-1.jpg",
          "alt": "Wireless Headphones - Front view",
          "isPrimary": true
        }
      ],
      "category": {
        "id": "cat-789",
        "name": "Electronics",
        "slug": "electronics"
      },
      "brand": {
        "id": "brand-001",
        "name": "AudioTech"
      },
      "attributes": {
        "color": "black",
        "weight": "250g",
        "connectivity": "bluetooth"
      },
      "inventory": {
        "available": 50,
        "reserved": 5,
        "status": "in_stock"
      },
      "rating": {
        "average": 4.5,
        "count": 128
      },
      "isActive": true,
      "createdAt": "2024-01-10T08:00:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

#### Obtener Producto
```http
GET /api/v1/products/{id}
```

Response (200):
```json
{
  "id": "prod-456",
  "sku": "SKU-12345",
  "name": "Wireless Headphones",
  "slug": "wireless-headphones",
  "description": "High-quality wireless headphones with noise cancellation",
  "shortDescription": "Premium wireless headphones",
  "price": {
    "amount": 99.99,
    "currency": "USD",
    "compareAt": 129.99
  },
  "images": [
    {
      "url": "https://cdn.example.com/products/prod-456-1.jpg",
      "alt": "Wireless Headphones - Front view",
      "isPrimary": true
    },
    {
      "url": "https://cdn.example.com/products/prod-456-2.jpg",
      "alt": "Wireless Headphones - Side view",
      "isPrimary": false
    }
  ],
  "category": {
    "id": "cat-789",
    "name": "Electronics",
    "slug": "electronics"
  },
  "brand": {
    "id": "brand-001",
    "name": "AudioTech"
  },
  "attributes": {
    "color": "black",
    "weight": "250g",
    "connectivity": "bluetooth",
    "batteryLife": "30 hours"
  },
  "variants": [
    {
      "id": "var-001",
      "sku": "SKU-12345-BLK",
      "name": "Black",
      "attributes": {
        "color": "black"
      },
      "price": 99.99,
      "inventory": {
        "available": 30
      }
    },
    {
      "id": "var-002",
      "sku": "SKU-12345-WHT",
      "name": "White",
      "attributes": {
        "color": "white"
      },
      "price": 99.99,
      "inventory": {
        "available": 20
      }
    }
  ],
  "inventory": {
    "available": 50,
    "reserved": 5,
    "status": "in_stock"
  },
  "rating": {
    "average": 4.5,
    "count": 128,
    "distribution": {
      "5": 80,
      "4": 30,
      "3": 10,
      "2": 5,
      "1": 3
    }
  },
  "reviews": [
    {
      "id": "rev-001",
      "userId": "user-123",
      "userName": "John D.",
      "rating": 5,
      "title": "Excellent headphones!",
      "content": "Great sound quality and battery life.",
      "verified": true,
      "createdAt": "2024-01-10T08:00:00Z"
    }
  ],
  "isActive": true,
  "createdAt": "2024-01-10T08:00:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

#### Crear Producto (Admin)
```http
POST /api/v1/products
Authorization: Bearer {admin_token}
```

Request:
```json
{
  "sku": "SKU-12345",
  "name": "Wireless Headphones",
  "slug": "wireless-headphones",
  "description": "High-quality wireless headphones",
  "shortDescription": "Premium wireless headphones",
  "price": {
    "amount": 99.99,
    "currency": "USD",
    "compareAt": 129.99
  },
  "categoryId": "cat-789",
  "brandId": "brand-001",
  "attributes": {
    "color": "black",
    "weight": "250g"
  },
  "images": [
    {
      "url": "https://cdn.example.com/products/prod-456-1.jpg",
      "alt": "Wireless Headphones",
      "isPrimary": true
    }
  ],
  "initialStock": 50
}
```

#### Actualizar Producto (Admin)
```http
PUT /api/v1/products/{id}
Authorization: Bearer {admin_token}
```

#### Eliminar Producto (Admin)
```http
DELETE /api/v1/products/{id}
Authorization: Bearer {admin_token}
```

#### Listar Categorías
```http
GET /api/v1/categories
```

Response (200):
```json
{
  "data": [
    {
      "id": "cat-789",
      "name": "Electronics",
      "slug": "electronics",
      "description": "Electronic devices and accessories",
      "image": "https://cdn.example.com/categories/electronics.jpg",
      "parentId": null,
      "children": [
        {
          "id": "cat-790",
          "name": "Headphones",
          "slug": "headphones",
          "parentId": "cat-789"
        }
      ],
      "productCount": 150,
      "isActive": true
    }
  ]
}
```

#### Buscar Productos
```http
GET /api/v1/products/search?q={query}
```

Query Parameters:
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `q` | string | Término de búsqueda (requerido) |
| `filters` | object | Filtros adicionales |
| `facets` | boolean | Incluir facets (default: true) |

Response (200):
```json
{
  "query": "wireless headphones",
  "results": {
    "total": 45,
    "data": [...]
  },
  "facets": {
    "categories": [
      { "id": "cat-789", "name": "Electronics", "count": 30 },
      { "id": "cat-790", "name": "Headphones", "count": 15 }
    ],
    "brands": [
      { "id": "brand-001", "name": "AudioTech", "count": 20 },
      { "id": "brand-002", "name": "SoundMax", "count": 10 }
    ],
    "priceRanges": [
      { "min": 0, "max": 50, "count": 10 },
      { "min": 50, "max": 100, "count": 25 },
      { "min": 100, "max": 200, "count": 10 }
    ]
  },
  "suggestions": [
    "wireless earbuds",
    "bluetooth headphones",
    "noise cancelling headphones"
  ]
}
```

---

## Cart Service API

### Base URL
```
http://localhost:3003
```

### Endpoints

#### Obtener Carrito
```http
GET /api/v1/cart
Authorization: Bearer {access_token}
```

Response (200):
```json
{
  "id": "cart-789",
  "userId": "user-123",
  "items": [
    {
      "id": "item-001",
      "productId": "prod-456",
      "sku": "SKU-12345",
      "name": "Wireless Headphones",
      "image": "https://cdn.example.com/products/prod-456-1.jpg",
      "quantity": 2,
      "unitPrice": 99.99,
      "totalPrice": 199.98,
      "variantId": "var-001",
      "attributes": {
        "color": "black"
      },
      "available": true
    }
  ],
  "summary": {
    "itemCount": 2,
    "uniqueItems": 1,
    "subtotal": 199.98,
    "discount": 0,
    "tax": 0,
    "shipping": 0,
    "total": 199.98,
    "currency": "USD"
  },
  "coupons": [],
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:30:00Z",
  "expiresAt": "2024-01-16T10:30:00Z"
}
```

#### Agregar Item al Carrito
```http
POST /api/v1/cart/items
Authorization: Bearer {access_token}
```

Request:
```json
{
  "productId": "prod-456",
  "quantity": 2,
  "variantId": "var-001"
}
```

Response (201):
```json
{
  "item": {
    "id": "item-001",
    "productId": "prod-456",
    "quantity": 2,
    "unitPrice": 99.99,
    "totalPrice": 199.98
  },
  "cart": {
    "id": "cart-789",
    "items": [...],
    "summary": {
      "subtotal": 199.98,
      "total": 199.98
    }
  }
}
```

#### Actualizar Cantidad
```http
PUT /api/v1/cart/items/{itemId}
Authorization: Bearer {access_token}
```

Request:
```json
{
  "quantity": 3
}
```

#### Eliminar Item
```http
DELETE /api/v1/cart/items/{itemId}
Authorization: Bearer {access_token}
```

#### Aplicar Cupón
```http
POST /api/v1/cart/coupon
Authorization: Bearer {access_token}
```

Request:
```json
{
  "code": "DISCOUNT10"
}
```

Response (200):
```json
{
  "coupon": {
    "code": "DISCOUNT10",
    "type": "percentage",
    "value": 10,
    "description": "10% off your order"
  },
  "discount": 20.00,
  "newTotal": 179.98
}
```

#### Eliminar Cupón
```http
DELETE /api/v1/cart/coupon
Authorization: Bearer {access_token}
```

#### Vaciar Carrito
```http
DELETE /api/v1/cart
Authorization: Bearer {access_token}
```

#### Checkout
```http
POST /api/v1/cart/checkout
Authorization: Bearer {access_token}
```

Request:
```json
{
  "shippingAddress": {
    "firstName": "John",
    "lastName": "Doe",
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zip": "10001",
    "country": "US",
    "phone": "+1234567890"
  },
  "billingAddress": {
    "sameAsShipping": true
  },
  "paymentMethod": "credit_card",
  "paymentToken": "tok_visa_4242"
}
```

Response (201):
```json
{
  "order": {
    "id": "order-abc",
    "orderNumber": "ORD-2024-0001",
    "status": "PENDING",
    "total": 225.98,
    "createdAt": "2024-01-15T10:30:00Z"
  },
  "payment": {
    "status": "processing",
    "clientSecret": "pi_1234567890_secret"
  }
}
```

---

## Order Service API

### Base URL
```
http://localhost:3004
```

### Endpoints

#### Listar Órdenes
```http
GET /api/v1/orders
Authorization: Bearer {access_token}
```

Query Parameters:
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `page` | integer | Número de página |
| `limit` | integer | Items por página |
| `status` | string | Filtrar por estado |
| `from` | date | Fecha desde |
| `to` | date | Fecha hasta |

Response (200):
```json
{
  "data": [
    {
      "id": "order-abc",
      "orderNumber": "ORD-2024-0001",
      "status": "CONFIRMED",
      "items": [
        {
          "productId": "prod-456",
          "name": "Wireless Headphones",
          "quantity": 2,
          "unitPrice": 99.99,
          "totalPrice": 199.98
        }
      ],
      "summary": {
        "subtotal": 199.98,
        "tax": 16.00,
        "shipping": 10.00,
        "discount": 0,
        "total": 225.98
      },
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5
  }
}
```

#### Obtener Orden
```http
GET /api/v1/orders/{id}
Authorization: Bearer {access_token}
```

Response (200):
```json
{
  "id": "order-abc",
  "orderNumber": "ORD-2024-0001",
  "userId": "user-123",
  "status": "CONFIRMED",
  "statusHistory": [
    {
      "status": "PENDING",
      "timestamp": "2024-01-15T10:30:00Z"
    },
    {
      "status": "CONFIRMED",
      "timestamp": "2024-01-15T10:31:00Z"
    }
  ],
  "items": [
    {
      "id": "item-001",
      "productId": "prod-456",
      "sku": "SKU-12345",
      "name": "Wireless Headphones",
      "image": "https://cdn.example.com/products/prod-456-1.jpg",
      "quantity": 2,
      "unitPrice": 99.99,
      "totalPrice": 199.98
    }
  ],
  "summary": {
    "subtotal": 199.98,
    "tax": 16.00,
    "taxRate": 0.08,
    "shipping": 10.00,
    "discount": 0,
    "total": 225.98,
    "currency": "USD"
  },
  "shippingAddress": {
    "firstName": "John",
    "lastName": "Doe",
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zip": "10001",
    "country": "US",
    "phone": "+1234567890"
  },
  "billingAddress": {
    "firstName": "John",
    "lastName": "Doe",
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zip": "10001",
    "country": "US"
  },
  "payment": {
    "method": "credit_card",
    "status": "COMPLETED",
    "transactionId": "pi_1234567890",
    "paidAt": "2024-01-15T10:31:00Z"
  },
  "shipment": {
    "carrier": "UPS",
    "trackingNumber": "1Z999AA10123456784",
    "status": "in_transit",
    "estimatedDelivery": "2024-01-18T00:00:00Z",
    "events": [
      {
        "status": "picked_up",
        "location": "New York, NY",
        "timestamp": "2024-01-15T14:00:00Z"
      }
    ]
  },
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T14:00:00Z"
}
```

#### Cancelar Orden
```http
POST /api/v1/orders/{id}/cancel
Authorization: Bearer {access_token}
```

Request:
```json
{
  "reason": "Changed my mind"
}
```

#### Solicitar Reembolso
```http
POST /api/v1/orders/{id}/refund
Authorization: Bearer {access_token}
```

Request:
```json
{
  "items": [
    {
      "itemId": "item-001",
      "quantity": 1,
      "reason": "Defective product"
    }
  ],
  "reason": "Product arrived damaged"
}
```

---

## Inventory Service API

### Base URL
```
http://localhost:3005
```

### Endpoints

#### Obtener Stock de Producto
```http
GET /api/v1/inventory/{productId}
```

Response (200):
```json
{
  "productId": "prod-456",
  "sku": "SKU-12345",
  "warehouses": [
    {
      "id": "wh-001",
      "name": "New York Warehouse",
      "available": 45,
      "reserved": 5,
      "committed": 0,
      "reorderPoint": 10,
      "reorderQuantity": 50
    }
  ],
  "total": {
    "available": 45,
    "reserved": 5,
    "committed": 0
  },
  "status": "in_stock",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

#### Actualizar Stock (Admin)
```http
PUT /api/v1/inventory/{productId}
Authorization: Bearer {admin_token}
```

Request:
```json
{
  "warehouseId": "wh-001",
  "quantity": 50,
  "reason": "restock",
  "reference": "PO-2024-001"
}
```

#### Reservar Stock (Internal)
```http
POST /api/v1/inventory/reserve
Authorization: Bearer {service_token}
```

Request:
```json
{
  "orderId": "order-abc",
  "items": [
    {
      "productId": "prod-456",
      "quantity": 2
    }
  ],
  "expiresIn": 900
}
```

#### Liberar Reserva (Internal)
```http
POST /api/v1/inventory/release
Authorization: Bearer {service_token}
```

Request:
```json
{
  "orderId": "order-abc",
  "reason": "order_cancelled"
}
```

---

## Common Patterns

### Paginación

Todas las listas soportan paginación:

```
GET /api/v1/products?page=2&limit=50
```

Response incluye:
```json
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 50,
    "total": 150,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": true
  },
  "links": {
    "self": "/api/v1/products?page=2&limit=50",
    "first": "/api/v1/products?page=1&limit=50",
    "prev": "/api/v1/products?page=1&limit=50",
    "next": "/api/v1/products?page=3&limit=50",
    "last": "/api/v1/products?page=3&limit=50"
  }
}
```

### Filtrado

```
GET /api/v1/products?category=electronics&minPrice=50&maxPrice=200&inStock=true
```

### Ordenamiento

```
GET /api/v1/products?sort=price_desc
GET /api/v1/orders?sort=createdAt_desc
```

Campos de ordenamiento soportados:
- `price_asc`, `price_desc`
- `name_asc`, `name_desc`
- `createdAt_asc`, `createdAt_desc`
- `updatedAt_asc`, `updatedAt_desc`

### Campos Selectivos

```
GET /api/v1/products/123?fields=id,name,price
```

### Expansión de Relaciones

```
GET /api/v1/products/123?expand=category,brand,reviews
```

---

## Referencias

- [Architecture Overview](ARCHITECTURE_OVERVIEW.md)
- [Data Flow](DATA_FLOW.md)
- [Event Catalog](EVENT_CATALOG.md)
- [Postman Collection](../api/postman-collection.json)
- [OpenAPI Spec](../api/openapi.yaml)
