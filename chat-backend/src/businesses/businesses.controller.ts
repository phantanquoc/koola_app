import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { BusinessesService } from './businesses.service';
import { ListBusinessesDto } from './dto/list-businesses.dto';
import { CreateBusinessDto } from './dto/create-business.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('businesses')
@ApiBearerAuth()
@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  @Get()
  @ApiOperation({ summary: 'List businesses with optional filters' })
  @ApiResponse({ status: 200 })
  async list(
    @Query() query: ListBusinessesDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.businessesService.listBusinesses(user.userId, query);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get businesses owned by current user' })
  @ApiResponse({ status: 200 })
  async getMyBusinesses(@CurrentUser() user: { userId: string }) {
    return this.businessesService.getMyBusinesses(user.userId);
  }

  @Get('connected')
  @ApiOperation({ summary: 'Get businesses the current user is connected to' })
  @ApiResponse({ status: 200 })
  async getMyConnections(@CurrentUser() user: { userId: string }) {
    return this.businessesService.getMyConnections(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get business profile by ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Business not found' })
  async getById(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.businessesService.getBusinessById(id, user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new business listing' })
  @ApiResponse({ status: 201 })
  async create(
    @Body() dto: CreateBusinessDto,
    @CurrentUser() user: { userId: string },
  ) {
    const business = await this.businessesService.createBusiness(
      user.userId,
      dto,
    );
    return { business };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a business listing (owner only)' })
  @ApiResponse({ status: 200 })
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateBusinessDto>,
    @CurrentUser() user: { userId: string },
  ) {
    const business = await this.businessesService.updateBusiness(
      id,
      user.userId,
      dto,
    );
    return { business };
  }

  @Post(':id/connect')
  @ApiOperation({ summary: 'Connect to a business' })
  @ApiResponse({ status: 200 })
  async connect(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.businessesService.connectBusiness(id, user.userId);
  }

  @Delete(':id/connect')
  @ApiOperation({ summary: 'Disconnect from a business' })
  @ApiResponse({ status: 200 })
  async disconnect(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.businessesService.disconnectBusiness(id, user.userId);
  }
}
