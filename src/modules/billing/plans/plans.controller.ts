import { PlansService } from './plans.service';
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Billing')
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all plans',
    description: 'Retrieve all available billing plans with pricing and features. No authentication required.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of billing plans',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          displayName: { type: 'string' },
          price: { type: 'string' },
          resolutions: { type: 'number' },
          costPerResolution: { type: 'string' },
          emailLimit: { type: 'number', nullable: true },
          features: { type: 'array', items: { type: 'string' } },
          createdAt: { type: 'string' },
          updatedAt: { type: 'string' },
        },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  findAll() {
    return this.plansService.getAllPlans();
  }
}
