import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { ConfigService, type PublicConfig } from './config.service';

/** Cấu hình mà client (mobile/web) được phép thấy. Không có `updatedBy`. */
export interface ClientConfig {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  forceUpdate: PublicConfig['forceUpdate'];
  announcement: PublicConfig['announcement'];
  featureFlags: Record<string, boolean>;
}

/**
 * Cấu hình công khai cho client — `@Public()` vì app phải đọc được **trước khi
 * đăng nhập** (màn hình bảo trì, ép cập nhật).
 *
 * Vì sao tách khỏi `/admin/config`: route admin yêu cầu JWT + quyền admin, và
 * `PublicConfig` hiện là cùng shape nên dễ tưởng mở `/admin/config` là xong —
 * làm vậy sẽ biến cấu hình nội bộ thành endpoint không cần đăng nhập. Ở đây chỉ
 * trả những field client thật sự cần.
 *
 * `@SkipThrottle()` vì client gọi lúc khởi động; bị 429 lúc mở app sẽ hiện màn
 * hình lỗi thay vì nội dung bảo trì. Đây là endpoint chỉ đọc, dữ liệu công khai
 * và đã cache 30s ở service.
 */
@ApiTags('config')
@Public()
@SkipThrottle({ short: true, long: true })
@Controller('config')
export class PublicConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get('public')
  @ApiOperation({
    summary: 'Cấu hình công khai (bảo trì, ép cập nhật, thông báo, feature flag)',
  })
  @ApiResponse({ status: 200, description: 'Cấu hình hiện tại' })
  async getPublic(): Promise<ClientConfig> {
    const cfg = await this.configService.get();
    return {
      maintenanceMode: cfg.maintenanceMode,
      maintenanceMessage: cfg.maintenanceMessage,
      forceUpdate: cfg.forceUpdate,
      announcement: cfg.announcement,
      featureFlags: cfg.featureFlags,
    };
  }
}
