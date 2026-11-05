import { Types } from 'mongoose';
import { RefreshTokenSchema } from './refresh-token.schema';
import { UserConversationSchema } from '../conversations/user-conversation.schema';
import { ConversationDocSchema, MemberSchema } from '../conversations/conversation.schema';
import { UserSchema } from '../users/user.schema';

/**
 * Chốt chống tái phát: `@Prop({ type: Types.ObjectId })` biến path thành Mixed.
 *
 * `@nestjs/mongoose` gọi `DefinitionsFactory.isMongooseSchemaType()` để quyết
 * định giữ nguyên type; `Types.ObjectId` là class BSON nên trượt kiểm tra và
 * bị thay bằng object rỗng → mongoose tạo path Mixed → **cast chuỗi ObjectId
 * không xảy ra**. Hệ quả thật đã gặp: `{ userId: '6ad…' }` không khớp bản ghi
 * nào trong DB, nên `revoke-sessions` trả `{revoked: 0}`, ban không đá được
 * phiên, và danh sách phiên luôn rỗng.
 *
 * Đúng phải là `SchemaTypes.ObjectId`.
 */
describe('ObjectId props phải khai bằng SchemaTypes.ObjectId', () => {
  it('RefreshToken.userId cast được chuỗi thành ObjectId', () => {
    const path = RefreshTokenSchema.path('userId');
    expect(path.instance).toBe('ObjectId');
    expect(path.cast('6ad17a57c4379c1016089c4b')).toBeInstanceOf(
      Types.ObjectId,
    );
  });

  it.each([
    ['UserConversation', UserConversationSchema.paths, ['userId', 'conversationId', 'lastReadMessageId']],
    ['ConversationDoc', ConversationDocSchema.paths, ['createdBy']],
    ['Member (members[])', MemberSchema.paths, ['userId']],
    ['User', UserSchema.paths, ['ownerUserId']],
  ] as const)('%s không còn path ref nào bị Mixed', (_name, paths, fields) => {
    const typed = paths as Record<string, { instance?: string }>;
    const mixed = fields.filter((field) => typed[field]?.instance !== 'ObjectId');
    expect(mixed).toEqual([]);
  });
});
