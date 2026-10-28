import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Chuẩn hoá body lỗi: `{ statusCode, message, ...extra, timestamp }`.
 *
 * Field phụ trong payload của `HttpException` được **forward nguyên vẹn**. Lý do:
 * client cần phân biệt các 403 khác nhau và cần dữ liệu để tự xử lý —
 * - `code: 'mfa_required'` → admin-web hiện màn hình bật 2FA thay vì `/forbidden`
 * - `code: 'account_banned'` + `appealToken` → người bị cấm vẫn nộp được kháng nghị
 *
 * Trước đây filter chỉ trả `message`, nên `code` và `appealToken` bị nuốt: mọi 403
 * trông giống nhau và client không có đường tự phục hồi.
 *
 * Payload do chính server tạo từ các `throw new XxxException({...})`, không phải
 * dữ liệu người dùng — nên forward là an toàn; `statusCode`/`message`/`error` được
 * loại để không đè lên giá trị đã chuẩn hoá.
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      response.status(status).json({
        statusCode: status,
        message: payload,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const {
      statusCode: _statusCode,
      message,
      error: _error,
      ...extra
    } = payload as Record<string, unknown>;

    response.status(status).json({
      statusCode: status,
      message,
      ...extra,
      timestamp: new Date().toISOString(),
    });
  }
}
