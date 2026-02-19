import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean existing data
  await prisma.product.deleteMany();
  await prisma.subcategory.deleteMany();
  await prisma.category.deleteMany();

  console.log('✅ Cleaned existing data');

  // Create Categories
  const tazasCategory = await prisma.category.create({
    data: {
      name: 'Tazas',
      slug: 'tazas',
      description: 'Tazas personalizadas y de diseño para todos los gustos'
    }
  });

  const bebeCategory = await prisma.category.create({
    data: {
      name: 'Para el bebé',
      slug: 'para-el-bebe',
      description: 'Todo lo que necesitas para el cuidado y diversión de tu bebé'
    }
  });

  console.log('✅ Created categories:', { tazas: tazasCategory.id, bebe: bebeCategory.id });

  // Create Subcategories
  const juguetesSubcategory = await prisma.subcategory.create({
    data: {
      name: 'Juguetes',
      slug: 'juguetes',
      categoryId: bebeCategory.id
    }
  });

  const ropaSubcategory = await prisma.subcategory.create({
    data: {
      name: 'Ropa',
      slug: 'ropa',
      categoryId: bebeCategory.id
    }
  });

  const ceramicasSubcategory = await prisma.subcategory.create({
    data:
    {
      name: 'Cerámicas',
      slug: 'ceramicas',
      categoryId: tazasCategory.id
    }
  });

  const termosSubcategory = await prisma.subcategory.create({
    data: {
      name: 'Termos',
      slug: 'termos',
      categoryId: tazasCategory.id
    }
  });

  console.log('✅ Created subcategories');

  // Create Products
  const products = [
    // Tazas - Cerámicas
    {
      sku: 'TAZA-001',
      name: 'Taza de Cerámica Clásica',
      description: 'Taza de cerámica de alta calidad con acabado brillante. Capacidad: 350ml. Ideal para café, té o chocolate.',
      price: 12.99,
      stock: 50,
      images: ['https://example.com/images/taza-ceramica-1.jpg', 'https://example.com/images/taza-ceramica-2.jpg'],
      categoryId: tazasCategory.id,
      subcategoryId: ceramicasSubcategory.id,
      isActive: true
    },
    {
      sku: 'TAZA-002',
      name: 'Taza Personalizable con Nombre',
      description: 'Taza blanca personalizable con el nombre o mensaje que desees. Perfecta para regalos.',
      price: 15.99,
      stock: 30,
      images: ['https://example.com/images/taza-personalizable-1.jpg'],
      categoryId: tazasCategory.id,
      subcategoryId: ceramicasSubcategory.id,
      isActive: true
    },
    {
      sku: 'TAZA-003',
      name: 'Taza de Cerámica Artesanal',
      description: 'Taza hecha a mano por artesanos locales. Cada pieza es única con variaciones en el acabado.',
      price: 24.99,
      stock: 15,
      images: ['https://example.com/images/taza-artesanal-1.jpg', 'https://example.com/images/taza-artesanal-2.jpg'],
      categoryId: tazasCategory.id,
      subcategoryId: ceramicasSubcategory.id,
      isActive: true
    },
    // Tazas - Termos
    {
      sku: 'TERM-001',
      name: 'Termo de Acero Inoxidable 500ml',
      description: 'Termo de doble pared con aislamiento al vacío. Mantiene bebidas calientes por 12 horas o frías por 24 horas.',
      price: 29.99,
      stock: 40,
      images: ['https://example.com/images/termo-500-1.jpg', 'https://example.com/images/termo-500-2.jpg'],
      categoryId: tazasCategory.id,
      subcategoryId: termosSubcategory.id,
      isActive: true
    },
    {
      sku: 'TERM-002',
      name: 'Termo de Viaje con Tapa Antiderrame',
      description: 'Termo diseñado para llevar en el auto o la mochila. Tapa antiderrame con botón de apertura.',
      price: 22.99,
      stock: 25,
      images: ['https://example.com/images/termo-viaje-1.jpg'],
      categoryId: tazasCategory.id,
      subcategoryId: termosSubcategory.id,
      isActive: true
    },
    // Bebé - Juguetes
    {
      sku: 'JUG-001',
      name: 'Mordedor de Silicona Natural',
      description: 'Mordedor libre de BPA, hecho de silicona alimentaria. Alivia el dolor de encías durante la dentición.',
      price: 8.99,
      stock: 100,
      images: ['https://example.com/images/mordedor-1.jpg', 'https://example.com/images/mordedor-2.jpg'],
      categoryId: bebeCategory.id,
      subcategoryId: juguetesSubcategory.id,
      isActive: true
    },
    {
      sku: 'JUG-002',
      name: 'Sonajero Multisensorial',
      description: 'Sonajero con diferentes texturas, sonidos y colores. Estimula el desarrollo sensorial del bebé.',
      price: 14.99,
      stock: 60,
      images: ['https://example.com/images/sonajero-1.jpg'],
      categoryId: bebeCategory.id,
      subcategoryId: juguetesSubcategory.id,
      isActive: true
    },
    {
      sku: 'JUG-003',
      name: 'Peluche Educativo con Música',
      description: 'Peluche suave que reproduce canciones y sonidos de la naturaleza. Incluye luz nocturna suave.',
      price: 19.99,
      stock: 35,
      images: ['https://example.com/images/peluche-musical-1.jpg', 'https://example.com/images/peluche-musical-2.jpg'],
      categoryId: bebeCategory.id,
      subcategoryId: juguetesSubcategory.id,
      isActive: true
    },
    {
      sku: 'JUG-004',
      name: 'Bloques de Construcción Suaves',
      description: 'Set de 12 bloques de espuma suave con diferentes formas y colores. Perfectos para bebés.',
      price: 18.99,
      stock: 45,
      images: ['https://example.com/images/bloques-suaves-1.jpg'],
      categoryId: bebeCategory.id,
      subcategoryId: juguetesSubcategory.id,
      isActive: true
    },
    // Bebé - Ropa
    {
      sku: 'ROP-001',
      name: 'Body de Algodón Orgánico Pack x3',
      description: 'Pack de 3 bodies de algodón orgánico 100%. Suaves, hipoalergénicos y con cierre de broches.',
      price: 24.99,
      stock: 80,
      images: ['https://example.com/images/body-pack-1.jpg', 'https://example.com/images/body-pack-2.jpg'],
      categoryId: bebeCategory.id,
      subcategoryId: ropaSubcategory.id,
      isActive: true
    },
    {
      sku: 'ROP-002',
      name: 'Pijama de Invierno con Pies',
      description: 'Pijama abrigado de felpa con pies cubiertos. Disponible en varias tallas de 0 a 24 meses.',
      price: 16.99,
      stock: 55,
      images: ['https://example.com/images/pijama-invierno-1.jpg'],
      categoryId: bebeCategory.id,
      subcategoryId: ropaSubcategory.id,
      isActive: true
    },
    {
      sku: 'ROP-003',
      name: 'Gorro y Mitones de Recién Nacido',
      description: 'Set de gorro y mitones de algodón para mantener caliente al recién nacido.',
      price: 9.99,
      stock: 70,
      images: ['https://example.com/images/gorro-mitones-1.jpg'],
      categoryId: bebeCategory.id,
      subcategoryId: ropaSubcategory.id,
      isActive: true
    },
    {
      sku: 'ROP-004',
      name: 'Vestido de Fiesta para Bebé',
      description: 'Vestido elegante para ocasiones especiales. Incluye diadema a juego. Tallas 3-18 meses.',
      price: 34.99,
      stock: 20,
      images: ['https://example.com/images/vestido-fiesta-1.jpg', 'https://example.com/images/vestido-fiesta-2.jpg'],
      categoryId: bebeCategory.id,
      subcategoryId: ropaSubcategory.id,
      isActive: true
    }
  ];

  for (const product of products) {
    await prisma.product.create({ data: product });
  }

  console.log(`✅ Created ${products.length} products`);

  // Create some inactive products for testing
  await prisma.product.create({
    data: {
      sku: 'TAZA-DISCONTINUED',
      name: 'Taza Modelo Antiguo (Descontinuado)',
      description: 'Este producto ya no está disponible.',
      price: 9.99,
      stock: 0,
      images: [],
      categoryId: tazasCategory.id,
      subcategoryId: ceramicasSubcategory.id,
      isActive: false
    }
  });

  console.log('✅ Created inactive product for testing');

  console.log('\n🎉 Database seed completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`   - Categories: 2`);
  console.log(`   - Subcategories: 4`);
  console.log(`   - Products: ${products.length + 1}`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
