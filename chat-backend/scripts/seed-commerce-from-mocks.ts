/**
 * seed-commerce-from-mocks.ts — seeds the preview Services catalog only.
 *
 * Products are NO LONGER seeded here: they are seller-owned and come from
 * `scripts/seed-commerce-catalog.ts --owner-email <email>` (openspec change
 * `commerce-catalog-live`). The 3 seller-less products this script used to
 * create would never be publicly visible under the seller-ownership rule.
 */
import 'ts-node/register';
import mongoose from 'mongoose';
import { CommerceServiceSchema } from '../src/commerce/schemas/commerce-service.schema';

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat';
  await mongoose.connect(uri);
  const Service = mongoose.model('CommerceServiceDoc', CommerceServiceSchema);
  const services = [
    { _id: 'seed-service-1', name: 'Giao hàng nhanh', price: 15000, category: 'delivery' },
    { _id: 'seed-service-2', name: 'Dọn nhà', price: 199000, category: 'home' },
  ];
  for (const s of services) {
    const exists = await Service.findById(s._id);
    if (!exists) { await Service.create(s as any); console.log(`service ${s._id}`); }
  }
  await mongoose.disconnect();
  console.log('seed-commerce (services) done — products: run seed-commerce-catalog.ts');
}
main().catch((e) => { console.error(e); process.exit(1); });
