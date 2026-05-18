import { Controller, Get, Post, Body, Param, HttpCode } from '@nestjs/common'
import { OrdersService } from './orders.service'

interface CreateOrderDto {
  customerId: string
  items: string[]
  total: number
}

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll() {
    return this.ordersService.findAll()
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateOrderDto) {
    const { customerId, items, total } = dto
    return this.ordersService.create({ customerId, items, total })
  }
}
