import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { CommerceService } from './commerce.service';
import { PaginationDto } from '../admin/dto/pagination.dto';
import {
  ListProductsQueryDto,
  ListServicesQueryDto,
  ValidateProductsDto,
} from './dto/commerce.dto';

/** Public read throttle shared by every catalog endpoint (named throttlers). */
const PUBLIC_READ_THROTTLE = {
  short: { limit: 60, ttl: 60000 },
  long: { limit: 600, ttl: 60000 },
};

@Controller('commerce')
export class CommerceController {
  constructor(private readonly commerceService: CommerceService) {}

  @Public()
  @Throttle(PUBLIC_READ_THROTTLE)
  @Header('Cache-Control', 'public, max-age=60')
  @Get('products')
  listProducts(@Query() dto: ListProductsQueryDto) {
    return this.commerceService.listPublicProducts(dto);
  }

  // Declared before `products/:id` for readability; it is a POST so it can
  // never collide with the GET detail route anyway.
  @Public()
  @Throttle(PUBLIC_READ_THROTTLE)
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @Post('products/validate')
  validateProducts(@Body() dto: ValidateProductsDto) {
    return this.commerceService.validateProducts(dto.ids);
  }

  @Public()
  @Throttle(PUBLIC_READ_THROTTLE)
  @Header('Cache-Control', 'public, max-age=60')
  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return this.commerceService.getPublicProduct(id);
  }

  @Public()
  @Throttle(PUBLIC_READ_THROTTLE)
  @Header('Cache-Control', 'public, max-age=60')
  @Get('sellers/:id')
  getSeller(@Param('id') id: string) {
    return this.commerceService.getSellerStorefront(id);
  }

  @Public()
  @Throttle(PUBLIC_READ_THROTTLE)
  @Header('Cache-Control', 'public, max-age=60')
  @Get('services')
  listServices(@Query() dto: ListServicesQueryDto) {
    return this.commerceService.listServices(dto);
  }

  @Public()
  @Throttle(PUBLIC_READ_THROTTLE)
  @Get('stores')
  listStores(@Query() dto: PaginationDto) {
    return this.commerceService.listStores(dto);
  }
}
