import { Decimal } from '@prisma/client/runtime/library';

export enum CartStatus {
  ACTIVE = 'ACTIVE',
  CONVERTED = 'CONVERTED',
  ABANDONED = 'ABANDONED',
  EXPIRED = 'EXPIRED',
}

export interface CartItemData {
  id: string;
  cartId: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: Decimal | number;
  subtotal: Decimal | number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartData {
  id: string;
  userId: string;
  items: CartItemData[];
  total: Decimal | number;
  status: CartStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class CartItem {
  constructor(
    public readonly id: string,
    public readonly cartId: string,
    public readonly productId: string,
    public readonly productName: string,
    public readonly productSku: string,
    public quantity: number,
    public readonly unitPrice: Decimal | number,
    public subtotal: Decimal | number,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  static create(data: CartItemData): CartItem {
    return new CartItem(
      data.id,
      data.cartId,
      data.productId,
      data.productName,
      data.productSku,
      data.quantity,
      data.unitPrice,
      data.subtotal,
      data.createdAt,
      data.updatedAt
    );
  }

  updateQuantity(newQuantity: number): CartItem {
    const unitPriceNum = this.unitPrice instanceof Decimal 
      ? this.unitPrice.toNumber() 
      : this.unitPrice;
    
    const newSubtotal = unitPriceNum * newQuantity;
    
    return new CartItem(
      this.id,
      this.cartId,
      this.productId,
      this.productName,
      this.productSku,
      newQuantity,
      this.unitPrice,
      newSubtotal,
      this.createdAt,
      new Date()
    );
  }

  toJSON() {
    return {
      id: this.id,
      cartId: this.cartId,
      productId: this.productId,
      productName: this.productName,
      productSku: this.productSku,
      quantity: this.quantity,
      unitPrice: this.unitPrice instanceof Decimal 
        ? this.unitPrice.toNumber() 
        : this.unitPrice,
      subtotal: this.subtotal instanceof Decimal 
        ? this.subtotal.toNumber() 
        : this.subtotal,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

export class Cart {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public items: CartItem[],
    public total: Decimal | number,
    public status: CartStatus,
    public expiresAt: Date,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  static create(data: CartData): Cart {
    const items = data.items.map(item => CartItem.create(item));
    return new Cart(
      data.id,
      data.userId,
      items,
      data.total,
      data.status,
      data.expiresAt,
      data.createdAt,
      data.updatedAt
    );
  }

  addItem(item: CartItem): Cart {
    const existingItemIndex = this.items.findIndex(
      i => i.productId === item.productId
    );

    let newItems: CartItem[];
    if (existingItemIndex >= 0) {
      // Update existing item quantity
      const existingItem = this.items[existingItemIndex];
      const updatedItem = existingItem.updateQuantity(
        existingItem.quantity + item.quantity
      );
      newItems = [...this.items];
      newItems[existingItemIndex] = updatedItem;
    } else {
      // Add new item
      newItems = [...this.items, item];
    }

    const newTotal = this.calculateTotal(newItems);

    return new Cart(
      this.id,
      this.userId,
      newItems,
      newTotal,
      this.status,
      this.expiresAt,
      this.createdAt,
      new Date()
    );
  }

  updateItem(itemId: string, quantity: number): Cart {
    const itemIndex = this.items.findIndex(i => i.id === itemId);
    
    if (itemIndex < 0) {
      throw new Error(`Item ${itemId} not found in cart`);
    }

    const newItems = [...this.items];
    
    if (quantity <= 0) {
      // Remove item
      newItems.splice(itemIndex, 1);
    } else {
      // Update quantity
      newItems[itemIndex] = this.items[itemIndex].updateQuantity(quantity);
    }

    const newTotal = this.calculateTotal(newItems);

    return new Cart(
      this.id,
      this.userId,
      newItems,
      newTotal,
      this.status,
      this.expiresAt,
      this.createdAt,
      new Date()
    );
  }

  removeItem(itemId: string): Cart {
    const newItems = this.items.filter(i => i.id !== itemId);
    const newTotal = this.calculateTotal(newItems);

    return new Cart(
      this.id,
      this.userId,
      newItems,
      newTotal,
      this.status,
      this.expiresAt,
      this.createdAt,
      new Date()
    );
  }

  clear(): Cart {
    return new Cart(
      this.id,
      this.userId,
      [],
      0,
      this.status,
      this.expiresAt,
      this.createdAt,
      new Date()
    );
  }

  merge(otherCart: Cart): Cart {
    let mergedItems = [...this.items];

    for (const item of otherCart.items) {
      const existingItemIndex = mergedItems.findIndex(
        i => i.productId === item.productId
      );

      if (existingItemIndex >= 0) {
        const existingItem = mergedItems[existingItemIndex];
        mergedItems[existingItemIndex] = existingItem.updateQuantity(
          existingItem.quantity + item.quantity
        );
      } else {
        mergedItems.push(item);
      }
    }

    const newTotal = this.calculateTotal(mergedItems);

    return new Cart(
      this.id,
      this.userId,
      mergedItems,
      newTotal,
      this.status,
      this.expiresAt,
      this.createdAt,
      new Date()
    );
  }

  updateExpiration(newExpiresAt: Date): Cart {
    return new Cart(
      this.id,
      this.userId,
      this.items,
      this.total,
      this.status,
      newExpiresAt,
      this.createdAt,
      new Date()
    );
  }

  changeStatus(newStatus: CartStatus): Cart {
    return new Cart(
      this.id,
      this.userId,
      this.items,
      this.total,
      newStatus,
      this.expiresAt,
      this.createdAt,
      new Date()
    );
  }

  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  isActive(): boolean {
    return this.status === CartStatus.ACTIVE && !this.isExpired();
  }

  getItemCount(): number {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  private calculateTotal(items: CartItem[]): number {
    return items.reduce((sum, item) => {
      const subtotal = item.subtotal instanceof Decimal 
        ? item.subtotal.toNumber() 
        : item.subtotal;
      return sum + subtotal;
    }, 0);
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      items: this.items.map(item => item.toJSON()),
      total: this.total instanceof Decimal 
        ? this.total.toNumber() 
        : this.total,
      status: this.status,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      itemCount: this.getItemCount(),
      isExpired: this.isExpired(),
    };
  }
}
