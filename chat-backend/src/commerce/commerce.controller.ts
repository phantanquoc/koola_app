import { Controller, Get, Query, Header } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { CommerceService } from './commerce.service';
import { PaginationDto } from '../admin/dto/pagination.dto';

@Controller('commerce')
export class CommerceController {
  constructor(private readonly commerceService: CommerceService) {}

  @Public()
  @Throttle({
    short: { limit: 60, ttl: 60000 },
    long: { limit: 600, ttl: 60000 },
  })
  @Header('Cache-Control', 'public, max-age=60')
  @Get('products')
  listProducts(
    @Query() dto: PaginationDto & { category?: string; storeId?: string },
  ) {
    return this.commerceService.listProducts(dto as any);
  }

  @Public()
  @Throttle({
    short: { limit: 60, ttl: 60000 },
    long: { limit: 600, ttl: 60000 },
  })
  @Header('Cache-Control', 'public, max-age=60')
  @Get('services')
  listServices(@Query() dto: PaginationDto & { category?: string }) {
    return this.commerceService.listServices(dto as any);
  }

  @Public()
  @Get('stores')
  listStores(@Query() dto: PaginationDto) {
    return this.commerceService.listStores(dto);
  }
}
