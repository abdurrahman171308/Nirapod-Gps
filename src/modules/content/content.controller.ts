import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ContentService } from './content.service';
import { CreateContentDto, UpdateContentDto } from './dto';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { Role } from '../../common/enums/roles.enum';
import { ContentType } from '../../database/schemas/content.schema';

// ── App-user endpoints (authenticated, read-only) ──────────────────────────

@ApiTags('Content')
@ApiCookieAuth()
@Controller('content')
export class ContentUserController {
  constructor(private readonly contentService: ContentService) {}

  @Get()
  @ApiOperation({ summary: 'Get active content items visible in app' })
  @ApiQuery({ name: 'type', enum: ContentType, required: false, description: 'Filter by type: OFFER | FEATURE_NEWS | BANNER' })
  @ApiResponse({ status: 200, description: 'List of active content items' })
  async findActive(@Query('type') type?: ContentType) {
    return this.contentService.findActive(type);
  }

  @Get('all')
  @ApiOperation({ summary: 'Get all content items (active + inactive)' })
  @ApiQuery({ name: 'type', enum: ContentType, required: false, description: 'Filter by type: OFFER | FEATURE_NEWS | BANNER' })
  @ApiResponse({ status: 200, description: 'All content items' })
  async findAll(@Query('type') type?: ContentType) {
    return this.contentService.findAll(type);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single content item by ID' })
  @ApiParam({ name: 'id', description: 'Content item ID' })
  @ApiResponse({ status: 200, description: 'Content item details' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findOne(@Param('id') id: string) {
    return this.contentService.findOne(id);
  }
}

// ── Admin endpoints (full CRUD) ─────────────────────────────────────────────

@ApiTags('Content (Admin)')
@ApiCookieAuth()
@Controller('admin/content')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class ContentAdminController {
  constructor(private readonly contentService: ContentService) {}

  @Post()
  @ApiOperation({ summary: 'Create a content item (Admin only)' })
  @ApiResponse({ status: 201, description: 'Content item created' })
  async create(@Body() dto: CreateContentDto) {
    return this.contentService.create(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'List all content items (any logged-in user)' })
  @ApiQuery({ name: 'type', enum: ContentType, required: false, description: 'Filter by type' })
  @ApiResponse({ status: 200, description: 'All content items' })
  async findAll(@Query('type') type?: ContentType) {
    return this.contentService.findAll(type);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.USER)
  @ApiOperation({ summary: 'Get content item by ID (any logged-in user)' })
  @ApiParam({ name: 'id', description: 'Content item ID' })
  @ApiResponse({ status: 200, description: 'Content item details' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findOne(@Param('id') id: string) {
    return this.contentService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a content item (Admin only)' })
  @ApiParam({ name: 'id', description: 'Content item ID' })
  @ApiResponse({ status: 200, description: 'Content item updated' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateContentDto) {
    return this.contentService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a content item (Admin only)' })
  @ApiParam({ name: 'id', description: 'Content item ID' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async remove(@Param('id') id: string) {
    await this.contentService.remove(id);
  }
}
