import 'ts-node/register';
import mongoose from 'mongoose';
import { ReportSchema } from '../src/admin/schemas/report.schema';

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat';
  await mongoose.connect(uri);
  const Report = mongoose.model('Report', ReportSchema);
  const targets: Array<{ targetType: any; targetId: string }> = [
    { targetType: 'message', targetId: 'seed-msg-1' },
    { targetType: 'story', targetId: 'seed-story-1' },
    { targetType: 'user', targetId: 'seed-user-1' },
    { targetType: 'conversation', targetId: 'seed-conv-1' },
  ];
  for (let i = 0; i < 20; i++) {
    const t = targets[i % targets.length];
    const id = `seed-report-${i + 1}`;
    const exists = await Report.findOne({ _id: id as any } as any);
    if (exists) continue;
    await Report.create({
      _id: id as any,
      reporterId: `seed-reporter-${(i % 5) + 1}`,
      targetType: t.targetType,
      targetId: t.targetId,
      reason: `Seed report ${i + 1} - violation example`,
      status: 'pending',
    });
    console.log(`created ${id}`);
  }
  await mongoose.disconnect();
  console.log('seed-admin-reports done');
}
main().catch((e) => { console.error(e); process.exit(1); });
