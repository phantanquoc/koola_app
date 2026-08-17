import 'ts-node/register';
import mongoose from 'mongoose';
import { CommerceProductSchema } from '../src/commerce/schemas/commerce-product.schema';
import { CommerceServiceSchema } from '../src/commerce/schemas/commerce-service.schema';

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat';
  await mongoose.connect(uri);
  const Product = mongoose.model('CommerceProduct', CommerceProductSchema);
  const Service = mongoose.model('CommerceServiceDoc', CommerceServiceSchema);
  const products = [
    { _id: 'seed-product-1', name: 'Combo rau củ tươi Đà Lạt', price: 89000, category: 'grocery' },
    { _id: 'seed-product-2', name: 'Cơm gà sốt tiêu xanh', price: 45000, category: 'food' },
    { _id: 'seed-product-3', name: 'Tai nghe Bluetooth Mini', price: 249000, category: 'electronics' },
  ];
  for (const p of products) {
    const exists = await Product.findById(p._id);
    if (!exists) { await Product.create(p as any); console.log(`product ${p._id}`); }
  }
  const services = [
    { _id: 'seed-service-1', name: 'Giao hàng nhanh', price: 15000, category: 'delivery' },
    { _id: 'seed-service-2', name: 'Dọn nhà', price: 199000, category: 'home' },
  ];
  for (const s of services) {
    const exists = await Service.findById(s._id);
    if (!exists) { await Service.create(s as any); console.log(`service ${s._id}`); }
  }
  await mongoose.disconnect();
  console.log('seed-commerce done');
}
main().catch((e) => { console.error(e); process.exit(1); });
