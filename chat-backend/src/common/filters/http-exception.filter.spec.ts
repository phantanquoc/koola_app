import { HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function makeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return {
    host: {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost,
    status,
    json,
  };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('giữ message dạng chuỗi như trước', () => {
    const { host, status, json } = makeHost();
    filter.catch(new HttpException('forbidden', HttpStatus.FORBIDDEN), host);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, message: 'forbidden' }),
    );
    // Không có `code` thì không thêm key rỗng.
    expect(json.mock.calls[0][0]).not.toHaveProperty('code');
  });

  // 403 "cần bật 2FA" phải mang mã máy đọc được; thiếu `code` thì admin-web
  // đá mọi 403 sang /forbidden và admin không có đường bật 2FA.
  it('truyền `code` từ payload object ra response', () => {
    const { host, json } = makeHost();
    filter.catch(
      new HttpException(
        {
          statusCode: 403,
          code: 'mfa_required',
          message: 'Bật xác thực hai lớp',
        },
        HttpStatus.FORBIDDEN,
      ),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'mfa_required', message: 'Bật xác thực hai lớp' }),
    );
  });

  it('mảng message của ValidationPipe vẫn đi qua nguyên vẹn', () => {
    const { host, json } = makeHost();
    filter.catch(
      new HttpException(
        { statusCode: 400, message: ['a sai', 'b sai'] },
        HttpStatus.BAD_REQUEST,
      ),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: ['a sai', 'b sai'] }),
    );
  });
});

describe('HttpExceptionFilter — forward field phụ', () => {
  const filter = new HttpExceptionFilter();

  // Người bị cấm không đăng nhập được; họ chỉ còn vé 10 phút để nộp kháng nghị.
  // Filter nuốt `appealToken` là tính năng kháng nghị chết với đúng người cần.
  it('forward appealToken của 403 account_banned', () => {
    const { host, json } = makeHost();
    filter.catch(
      new HttpException(
        {
          statusCode: 403,
          code: 'account_banned',
          message: 'Account has been banned.',
          banReason: 'spam',
          bannedUntil: null,
          appealToken: 'jwt-abc',
        },
        HttpStatus.FORBIDDEN,
      ),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'account_banned',
        banReason: 'spam',
        appealToken: 'jwt-abc',
        message: 'Account has been banned.',
      }),
    );
  });

  it('payload không đè statusCode/message đã chuẩn hoá', () => {
    const { host, json } = makeHost();
    filter.catch(
      new HttpException(
        { statusCode: 999, message: 'thật', error: 'Sai' },
        HttpStatus.CONFLICT,
      ),
      host,
    );

    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body.statusCode).toBe(409);
    expect(body.message).toBe('thật');
    // `error` là field do Nest tự thêm, không phải dữ liệu client cần.
    expect(body).not.toHaveProperty('error');
  });
});
