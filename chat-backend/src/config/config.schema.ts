import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes } from 'mongoose';

/**
 * Cấu hình toàn hệ thống là một document duy nhất. Dùng _id cố định để
 * `findOneAndUpdate` upsert được mà không cần query "lấy dòng đầu tiên" —
 * sai một chút là sinh thêm dòng thứ hai và mỗi instance đọc một bản khác nhau.
 */
export const CONFIG_SINGLETON_ID = 'singleton';

export interface ForceUpdatePlatform {
  minVersion: string;
  message: string;
}

export interface ForceUpdateConfig {
  android: ForceUpdatePlatform;
  ios: ForceUpdatePlatform;
}

export interface AnnouncementConfig {
  title: string;
  body: string;
  active: boolean;
  /** Lúc bật/sửa thông báo — client dùng để bỏ qua bản đã xem. */
  at: Date | null;
}

@Schema({ _id: false })
export class ForceUpdatePlatformConfig implements ForceUpdatePlatform {
  @Prop({ type: String, default: '' })
  minVersion: string;

  @Prop({ type: String, default: '' })
  message: string;
}

const ForceUpdatePlatformSchema = SchemaFactory.createForClass(
  ForceUpdatePlatformConfig,
);

@Schema({ _id: false })
export class ForceUpdateConfigDoc implements ForceUpdateConfig {
  @Prop({
    type: ForceUpdatePlatformSchema,
    default: () => ({ minVersion: '', message: '' }),
  })
  android: ForceUpdatePlatform;

  @Prop({
    type: ForceUpdatePlatformSchema,
    default: () => ({ minVersion: '', message: '' }),
  })
  ios: ForceUpdatePlatform;
}

const ForceUpdateSchema = SchemaFactory.createForClass(ForceUpdateConfigDoc);

@Schema({ _id: false })
export class AnnouncementConfigDoc implements AnnouncementConfig {
  @Prop({ type: String, default: '' })
  title: string;

  @Prop({ type: String, default: '' })
  body: string;

  @Prop({ type: Boolean, default: false })
  active: boolean;

  @Prop({ type: Date, default: null })
  at: Date | null;
}

const AnnouncementSchema = SchemaFactory.createForClass(AnnouncementConfigDoc);

@Schema({ collection: 'app_config', timestamps: true })
export class AppConfig {
  @Prop({ type: String, required: true, default: CONFIG_SINGLETON_ID })
  _id: string;

  @Prop({ type: Boolean, default: false })
  maintenanceMode: boolean;

  @Prop({ type: String, default: '', maxlength: 500 })
  maintenanceMessage: string;

  @Prop({
    type: ForceUpdateSchema,
    default: () => ({
      android: { minVersion: '', message: '' },
      ios: { minVersion: '', message: '' },
    }),
  })
  forceUpdate: ForceUpdateConfig;

  /**
   * Mixed vì tên cờ do vận hành tự đặt, không biết trước. Giá trị vẫn bị
   * DTO ép boolean ở biên HTTP — Mixed ở đây chỉ để không phải migrate schema
   * mỗi lần thêm cờ mới.
   */
  @Prop({ type: SchemaTypes.Mixed, default: () => ({}) })
  featureFlags: Record<string, boolean>;

  @Prop({
    type: AnnouncementSchema,
    default: () => ({ title: '', body: '', active: false, at: null }),
  })
  announcement: AnnouncementConfig;

  /** Actor admin thực hiện lần sửa gần nhất — không trả ra API. */
  @Prop({ type: String, default: null })
  updatedBy: string | null;
}

export type AppConfigDocument = AppConfig & Document;

export const AppConfigSchema = SchemaFactory.createForClass(AppConfig);
