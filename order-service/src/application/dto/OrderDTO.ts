import { OrderStatus } from '@prisma/client';
import { Address, OrderData } from '../../domain/entities/Order';

// ============== Request DTOs ==============

export interface CreateOrderItemRequest {
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateOrderRequest {
  items: CreateOrderItemRequest[];
  shippingAddress?: Address;
  billingAddress?: Address;
  notes?: string;
}

export interface CreateOrderFromCartRequest {
  cartId: string;
  shippingAddress?: Address;
  billingAddress?: Address;
  notes?: string;
}

export interface UpdateOrderStatusRequest {
  status: OrderStatus;
  notes?: string;
}

export interface CancelOrderRequest {
  reason?: string;
}

// ============== Response DTOs ==============

export interface OrderItemResponse {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  createdAt: Date;
}

export interface OrderStatusHistoryResponse {
  id: string;
  status: OrderStatus;
  previousStatus: OrderStatus | null;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
}

export interface OrderResponse {
  id: string;
  orderNumber: string;
  userId: string;
  userEmail: string;
  status: OrderStatus;
  items: OrderItemResponse[];
  total: number;
  tax: number;
  shipping: number;
  grandTotal: number;
  shippingAddress: Address | null;
  billingAddress: Address | null;
  notes: string | null;
  paidAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  statusHistory: OrderStatusHistoryResponse[];
}

export interface OrderListResponse {
  orders: OrderResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface OrderSummaryResponse {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  grandTotal: number;
  itemCount: number;
  createdAt: Date;
}

// ============== Event DTOs ==============

export interface OrderCreatedEvent {
  eventType: 'OrderCreated';
  aggregateId: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  userEmail: string;
  items: Array<{
    productId: string;
    productName: string;
    productSku: string;
    quantity: number;
    unitPrice: number;
  }>;
  total: number;
  timestamp: string;
}

export interface OrderConfirmedEvent {
  eventType: 'OrderConfirmed';
  aggregateId: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  userEmail: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  timestamp: string;
}

export interface OrderFailedEvent {
  eventType: 'OrderFailed';
  aggregateId: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  userEmail: string;
  reason: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  timestamp: string;
}

export interface OrderCancelledEvent {
  eventType: 'OrderCancelled';
  aggregateId: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  userEmail: string;
  reason: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  timestamp: string;
}

export interface OrderCompletedEvent {
  eventType: 'OrderCompleted';
  aggregateId: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  userEmail: string;
  total: number;
  timestamp: string;
}

export interface OrderStatusChangedEvent {
  eventType: 'OrderStatusChanged';
  aggregateId: string;
  orderId: string;
  orderNumber: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  userId: string;
  timestamp: string;
}

// ============== External Event DTOs ==============

export interface StockReservedEvent {
  eventType: 'StockReserved';
  orderId: string;
  reservationId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  timestamp: string;
}

export interface StockReservationFailedEvent {
  eventType: 'StockReservationFailed';
  orderId: string;
  reason: string;
  items: Array<{
    productId: string;
    quantity: number;
    availableStock?: number;
  }>;
  timestamp: string;
}

export interface PaymentCompletedEvent {
  eventType: 'PaymentCompleted';
  orderId: string;
  paymentId: string;
  amount: number;
  timestamp: string;
}

export interface PaymentFailedEvent {
  eventType: 'PaymentFailed';
  orderId: string;
  paymentId: string;
  reason: string;
  timestamp: string;
}

// ============== Mappers ==============

export class OrderDTOMapper {
  static toOrderResponse(order: OrderData): OrderResponse {
    return {
      id: order.id || '',
      orderNumber: order.orderNumber,
      userId: order.userId,
      userEmail: order.userEmail,
      status: order.status,
      items: order.items.map(item => ({
        id: item.id || '',
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        createdAt: item.createdAt || new Date(),
      })),
      total: order.total,
      tax: order.tax,
      shipping: order.shipping,
      grandTotal: order.grandTotal,
      shippingAddress: order.shippingAddress || null,
      billingAddress: order.billingAddress || null,
      notes: order.notes || null,
      paidAt: order.paidAt || null,
      shippedAt: order.shippedAt || null,
      deliveredAt: order.deliveredAt || null,
      cancelledAt: order.cancelledAt || null,
      createdAt: order.createdAt || new Date(),
      updatedAt: order.updatedAt || new Date(),
      statusHistory: (order.statusHistory || []).map(h => ({
        id: h.id || '',
        status: h.status,
        previousStatus: h.previousStatus || null,
        notes: h.notes || null,
        createdBy: h.createdBy || 'system',
        createdAt: h.createdAt || new Date(),
      })),
    };
  }

  static toOrderSummaryResponse(order: OrderData): OrderSummaryResponse {
    return {
      id: order.id || '',
      orderNumber: order.orderNumber,
      status: order.status,
      grandTotal: order.grandTotal,
      itemCount: order.items.length,
      createdAt: order.createdAt || new Date(),
    };
  }

  static toOrderCreatedEvent(order: OrderData): OrderCreatedEvent {
    return {
      eventType: 'OrderCreated',
      aggregateId: order.id || '',
      orderId: order.id || '',
      orderNumber: order.orderNumber,
      userId: order.userId,
      userEmail: order.userEmail,
      items: order.items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      total: order.total,
      timestamp: new Date().toISOString(),
    };
  }

  static toOrderConfirmedEvent(order: OrderData): OrderConfirmedEvent {
    return {
      eventType: 'OrderConfirmed',
      aggregateId: order.id || '',
      orderId: order.id || '',
      orderNumber: order.orderNumber,
      userId: order.userId,
      userEmail: order.userEmail,
      items: order.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      timestamp: new Date().toISOString(),
    };
  }

  static toOrderFailedEvent(
    order: OrderData,
    reason: string
  ): OrderFailedEvent {
    return {
      eventType: 'OrderFailed',
      aggregateId: order.id || '',
      orderId: order.id || '',
      orderNumber: order.orderNumber,
      userId: order.userId,
      userEmail: order.userEmail,
      reason,
      items: order.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      timestamp: new Date().toISOString(),
    };
  }

  static toOrderCancelledEvent(
    order: OrderData,
    reason: string
  ): OrderCancelledEvent {
    return {
      eventType: 'OrderCancelled',
      aggregateId: order.id || '',
      orderId: order.id || '',
      orderNumber: order.orderNumber,
      userId: order.userId,
      userEmail: order.userEmail,
      reason,
      items: order.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      timestamp: new Date().toISOString(),
    };
  }

  static toOrderCompletedEvent(order: OrderData): OrderCompletedEvent {
    return {
      eventType: 'OrderCompleted',
      aggregateId: order.id || '',
      orderId: order.id || '',
      orderNumber: order.orderNumber,
      userId: order.userId,
      userEmail: order.userEmail,
      total: order.grandTotal,
      timestamp: new Date().toISOString(),
    };
  }

  static toOrderStatusChangedEvent(
    order: OrderData,
    previousStatus: OrderStatus
  ): OrderStatusChangedEvent {
    return {
      eventType: 'OrderStatusChanged',
      aggregateId: order.id || '',
      orderId: order.id || '',
      orderNumber: order.orderNumber,
      previousStatus,
      newStatus: order.status,
      userId: order.userId,
      timestamp: new Date().toISOString(),
    };
  }
}

export default {
  OrderDTOMapper,
};
