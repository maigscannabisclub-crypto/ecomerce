import { OrderStatus } from '@prisma/client';

export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface OrderItemData {
  id?: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface OrderStatusHistoryData {
  id?: string;
  status: OrderStatus;
  previousStatus: OrderStatus | null;
  notes?: string;
  createdBy?: string;
  createdAt?: Date;
}

export interface OrderData {
  id?: string;
  orderNumber: string;
  userId: string;
  userEmail: string;
  status: OrderStatus;
  items: OrderItemData[];
  total: number;
  tax: number;
  shipping: number;
  grandTotal: number;
  shippingAddress?: Address;
  billingAddress?: Address;
  notes?: string;
  paidAt?: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
  cancelledAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  statusHistory?: OrderStatusHistoryData[];
}

export class OrderItem {
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  readonly productSku: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly subtotal: number;
  readonly createdAt: Date;

  constructor(data: OrderItemData) {
    this.id = data.id || '';
    this.productId = data.productId;
    this.productName = data.productName;
    this.productSku = data.productSku;
    this.quantity = data.quantity;
    this.unitPrice = data.unitPrice;
    this.subtotal = data.subtotal;
    this.createdAt = data.createdAt || new Date();
  }

  static create(data: Omit<OrderItemData, 'subtotal'>): OrderItem {
    const subtotal = data.unitPrice * data.quantity;
    return new OrderItem({ ...data, subtotal });
  }
}

export class OrderStatusHistory {
  readonly id: string;
  readonly status: OrderStatus;
  readonly previousStatus: OrderStatus | null;
  readonly notes: string;
  readonly createdBy: string;
  readonly createdAt: Date;

  constructor(data: OrderStatusHistoryData) {
    this.id = data.id || '';
    this.status = data.status;
    this.previousStatus = data.previousStatus || null;
    this.notes = data.notes || '';
    this.createdBy = data.createdBy || 'system';
    this.createdAt = data.createdAt || new Date();
  }

  static create(
    status: OrderStatus,
    previousStatus: OrderStatus | null = null,
    notes?: string,
    createdBy?: string
  ): OrderStatusHistory {
    return new OrderStatusHistory({
      status,
      previousStatus,
      notes,
      createdBy,
    });
  }
}

export class Order {
  readonly id: string;
  readonly orderNumber: string;
  readonly userId: string;
  readonly userEmail: string;
  private _status: OrderStatus;
  readonly items: OrderItem[];
  readonly total: number;
  readonly tax: number;
  readonly shipping: number;
  readonly grandTotal: number;
  readonly shippingAddress?: Address;
  readonly billingAddress?: Address;
  readonly notes?: string;
  readonly paidAt?: Date;
  readonly shippedAt?: Date;
  readonly deliveredAt?: Date;
  readonly cancelledAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly statusHistory: OrderStatusHistory[];

  constructor(data: OrderData) {
    this.id = data.id || '';
    this.orderNumber = data.orderNumber;
    this.userId = data.userId;
    this.userEmail = data.userEmail;
    this._status = data.status;
    this.items = data.items.map(item => new OrderItem(item));
    this.total = data.total;
    this.tax = data.tax;
    this.shipping = data.shipping;
    this.grandTotal = data.grandTotal;
    this.shippingAddress = data.shippingAddress;
    this.billingAddress = data.billingAddress;
    this.notes = data.notes;
    this.paidAt = data.paidAt;
    this.shippedAt = data.shippedAt;
    this.deliveredAt = data.deliveredAt;
    this.cancelledAt = data.cancelledAt;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.statusHistory = (data.statusHistory || []).map(
      h => new OrderStatusHistory(h)
    );
  }

  get status(): OrderStatus {
    return this._status;
  }

  static generateOrderNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ORD-${timestamp}-${random}`;
  }

  static calculateTotals(
    items: Array<{ quantity: number; unitPrice: number }>,
    taxRate: number = 0.1,
    shippingCost: number = 0
  ): { total: number; tax: number; shipping: number; grandTotal: number } {
    const total = items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );
    const tax = Math.round(total * taxRate * 100) / 100;
    const grandTotal = Math.round((total + tax + shippingCost) * 100) / 100;

    return {
      total: Math.round(total * 100) / 100,
      tax,
      shipping: shippingCost,
      grandTotal,
    };
  }

  static create(
    userId: string,
    userEmail: string,
    items: Array<{
      productId: string;
      productName: string;
      productSku: string;
      quantity: number;
      unitPrice: number;
    }>,
    shippingAddress?: Address,
    billingAddress?: Address,
    notes?: string
  ): Order {
    const orderNumber = Order.generateOrderNumber();
    const orderItems = items.map(item => OrderItem.create(item));
    const { total, tax, shipping, grandTotal } = Order.calculateTotals(items);

    const initialStatusHistory = OrderStatusHistory.create(
      OrderStatus.PENDING,
      null,
      'Order created',
      'system'
    );

    return new Order({
      orderNumber,
      userId,
      userEmail,
      status: OrderStatus.PENDING,
      items: orderItems.map(item => ({
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      })),
      total,
      tax,
      shipping,
      grandTotal,
      shippingAddress,
      billingAddress,
      notes,
      statusHistory: [initialStatusHistory],
    });
  }

  canTransitionTo(newStatus: OrderStatus): boolean {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [
        OrderStatus.RESERVED,
        OrderStatus.FAILED,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.RESERVED]: [
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.CONFIRMED]: [
        OrderStatus.PAID,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.PAID]: [
        OrderStatus.SHIPPED,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.SHIPPED]: [
        OrderStatus.DELIVERED,
      ],
      [OrderStatus.DELIVERED]: [],
      [OrderStatus.CANCELLED]: [],
      [OrderStatus.FAILED]: [
        OrderStatus.CANCELLED,
        OrderStatus.PENDING, // Allow retry
      ],
    };

    return validTransitions[this._status]?.includes(newStatus) || false;
  }

  transitionTo(
    newStatus: OrderStatus,
    notes?: string,
    createdBy?: string
  ): Order {
    if (!this.canTransitionTo(newStatus)) {
      throw new Error(
        `Invalid status transition from ${this._status} to ${newStatus}`
      );
    }

    const previousStatus = this._status;
    const statusHistoryEntry = OrderStatusHistory.create(
      newStatus,
      previousStatus,
      notes,
      createdBy
    );

    const updatedData: OrderData = {
      ...this.toJSON(),
      status: newStatus,
      statusHistory: [
        ...this.statusHistory.map(h => ({
          status: h.status,
          previousStatus: h.previousStatus,
          notes: h.notes,
          createdBy: h.createdBy,
          createdAt: h.createdAt,
        })),
        {
          status: statusHistoryEntry.status,
          previousStatus: statusHistoryEntry.previousStatus,
          notes: statusHistoryEntry.notes,
          createdBy: statusHistoryEntry.createdBy,
          createdAt: statusHistoryEntry.createdAt,
        },
      ],
    };

    // Add timestamp based on status
    if (newStatus === OrderStatus.PAID) {
      updatedData.paidAt = new Date();
    } else if (newStatus === OrderStatus.SHIPPED) {
      updatedData.shippedAt = new Date();
    } else if (newStatus === OrderStatus.DELIVERED) {
      updatedData.deliveredAt = new Date();
    } else if (newStatus === OrderStatus.CANCELLED) {
      updatedData.cancelledAt = new Date();
    }

    return new Order(updatedData);
  }

  cancel(reason?: string, cancelledBy?: string): Order {
    return this.transitionTo(
      OrderStatus.CANCELLED,
      reason || 'Order cancelled',
      cancelledBy
    );
  }

  isCancellable(): boolean {
    return [
      OrderStatus.PENDING,
      OrderStatus.RESERVED,
      OrderStatus.CONFIRMED,
    ].includes(this._status);
  }

  isFinal(): boolean {
    return [
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ].includes(this._status);
  }

  toJSON(): OrderData {
    return {
      id: this.id,
      orderNumber: this.orderNumber,
      userId: this.userId,
      userEmail: this.userEmail,
      status: this._status,
      items: this.items.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        productSku: item.productSku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        createdAt: item.createdAt,
      })),
      total: this.total,
      tax: this.tax,
      shipping: this.shipping,
      grandTotal: this.grandTotal,
      shippingAddress: this.shippingAddress,
      billingAddress: this.billingAddress,
      notes: this.notes,
      paidAt: this.paidAt,
      shippedAt: this.shippedAt,
      deliveredAt: this.deliveredAt,
      cancelledAt: this.cancelledAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      statusHistory: this.statusHistory.map(h => ({
        id: h.id,
        status: h.status,
        previousStatus: h.previousStatus,
        notes: h.notes,
        createdBy: h.createdBy,
        createdAt: h.createdAt,
      })),
    };
  }
}

export default Order;
