export interface ProductImage {
  url: string;
  alt?: string;
  isPrimary?: boolean;
}

export interface ProductProps {
  id?: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  images: string[];
  categoryId: string;
  subcategoryId: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Product {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly description: string;
  readonly price: number;
  readonly stock: number;
  readonly images: string[];
  readonly categoryId: string;
  readonly subcategoryId: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: ProductProps) {
    this.id = props.id || '';
    this.sku = props.sku;
    this.name = props.name;
    this.description = props.description;
    this.price = props.price;
    this.stock = props.stock;
    this.images = props.images || [];
    this.categoryId = props.categoryId;
    this.subcategoryId = props.subcategoryId;
    this.isActive = props.isActive ?? true;
    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();

    this.validate();
  }

  private validate(): void {
    if (!this.sku || this.sku.trim().length === 0) {
      throw new Error('SKU is required');
    }
    if (this.sku.length > 50) {
      throw new Error('SKU must be less than 50 characters');
    }
    if (!this.name || this.name.trim().length === 0) {
      throw new Error('Product name is required');
    }
    if (this.name.length > 200) {
      throw new Error('Product name must be less than 200 characters');
    }
    if (!this.description || this.description.trim().length === 0) {
      throw new Error('Product description is required');
    }
    if (this.price < 0) {
      throw new Error('Price cannot be negative');
    }
    if (this.stock < 0) {
      throw new Error('Stock cannot be negative');
    }
    if (!this.categoryId) {
      throw new Error('Category ID is required');
    }
    if (!this.subcategoryId) {
      throw new Error('Subcategory ID is required');
    }
  }

  isInStock(): boolean {
    return this.stock > 0 && this.isActive;
  }

  hasEnoughStock(quantity: number): boolean {
    return this.stock >= quantity && this.isActive;
  }

  canBePurchased(quantity: number): boolean {
    return this.isActive && this.hasEnoughStock(quantity);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      sku: this.sku,
      name: this.name,
      description: this.description,
      price: this.price,
      stock: this.stock,
      images: this.images,
      categoryId: this.categoryId,
      subcategoryId: this.subcategoryId,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

export interface CategoryProps {
  id?: string;
  name: string;
  slug: string;
  description?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Category {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: CategoryProps) {
    this.id = props.id || '';
    this.name = props.name;
    this.slug = props.slug;
    this.description = props.description;
    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();

    this.validate();
  }

  private validate(): void {
    if (!this.name || this.name.trim().length === 0) {
      throw new Error('Category name is required');
    }
    if (this.name.length > 100) {
      throw new Error('Category name must be less than 100 characters');
    }
    if (!this.slug || this.slug.trim().length === 0) {
      throw new Error('Category slug is required');
    }
    if (!/^[a-z0-9-]+$/.test(this.slug)) {
      throw new Error('Slug must contain only lowercase letters, numbers, and hyphens');
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      slug: this.slug,
      description: this.description,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

export interface SubcategoryProps {
  id?: string;
  name: string;
  slug: string;
  categoryId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Subcategory {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly categoryId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: SubcategoryProps) {
    this.id = props.id || '';
    this.name = props.name;
    this.slug = props.slug;
    this.categoryId = props.categoryId;
    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();

    this.validate();
  }

  private validate(): void {
    if (!this.name || this.name.trim().length === 0) {
      throw new Error('Subcategory name is required');
    }
    if (this.name.length > 100) {
      throw new Error('Subcategory name must be less than 100 characters');
    }
    if (!this.slug || this.slug.trim().length === 0) {
      throw new Error('Subcategory slug is required');
    }
    if (!/^[a-z0-9-]+$/.test(this.slug)) {
      throw new Error('Slug must contain only lowercase letters, numbers, and hyphens');
    }
    if (!this.categoryId) {
      throw new Error('Category ID is required');
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      slug: this.slug,
      categoryId: this.categoryId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}
