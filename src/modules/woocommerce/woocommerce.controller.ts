import { Controller, Get, Post, Body, Param, BadRequestException, Req } from '@nestjs/common';
import { WooCommerceService } from './woocommerce.service';

@Controller('woocommerce')
export class WooCommerceController {
  constructor(private readonly wooService: WooCommerceService) {}

  // Get all products
  @Get('products')
  async getProducts(@Req() req: any) {
    const userId = req?.cookies?.userId || req?.session?.userId || req?.user?.userId;
    if (!userId) {
      throw new BadRequestException('User not logged in');
    }
    return this.wooService.getProducts(String(userId));
  }

  // Get all orders
  @Get('orders')
  async getOrders(@Req() req: any) {
    const userId = req?.cookies?.userId || req?.session?.userId || req?.user?.userId;
    if (!userId) {
      throw new BadRequestException('User not logged in');
    }
    return this.wooService.getOrders(String(userId));
  }

  // Get all customers
  @Get('customers')
  async getCustomers(@Req() req: any) {
    const userId = req?.cookies?.userId || req?.session?.userId || req?.user?.userId;
    if (!userId) {
      throw new BadRequestException('User not logged in');
    }
    return this.wooService.getCustomers(String(userId));
  }

  // Create a new order
  @Post('orders')
  async createOrder(@Body() orderData: any, @Req() req: any) {
    const userId = req?.cookies?.userId || req?.session?.userId || req?.user?.userId;
    if (!userId) {
      throw new BadRequestException('User not logged in');
    }
    return this.wooService.createOrder(String(userId), orderData);
  }
 // Get Order By ID 
  @Get('orders/:id')
  async getOrder(@Param('id') id: string, @Req() req: any) {
    const userId = req?.cookies?.userId || req?.session?.userId || req?.user?.userId;
    if (!userId) {
      throw new BadRequestException('User not logged in');
    }
    const orderId = parseInt(id, 10);
    return this.wooService.getOrderById(String(userId), orderId);
  }
}
