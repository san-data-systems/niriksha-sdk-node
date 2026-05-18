import { Injectable, NotFoundException } from '@nestjs/common'
import { trace, SpanStatusCode } from '@opentelemetry/api'

export interface Order {
  id: string
  customerId: string
  items: string[]
  total: number
  status: 'pending' | 'confirmed' | 'shipped'
}

@Injectable()
export class OrdersService {
  private readonly tracer = trace.getTracer('orders-service')
  private readonly store: Map<string, Order> = new Map()

  findAll(): Order[] {
    return Array.from(this.store.values())
  }

  findOne(id: string): Order {
    return this.tracer.startActiveSpan('OrdersService.findOne', (span) => {
      try {
        span.setAttribute('order.id', id)
        const order = this.store.get(id)
        if (!order) {
          span.setAttribute('order.found', false)
          throw new NotFoundException(`Order ${id} not found`)
        }
        span.setAttribute('order.found', true)
        span.setAttribute('order.status', order.status)
        return order
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) })
        throw err
      } finally {
        span.end()
      }
    })
  }

  create(data: Pick<Order, 'customerId' | 'items' | 'total'>): Order {
    return this.tracer.startActiveSpan('OrdersService.create', (span) => {
      try {
        const order: Order = {
          id: `ord_${Date.now()}`,
          ...data,
          status: 'pending',
        }
        this.store.set(order.id, order)
        span.setAttribute('order.id', order.id)
        span.setAttribute('order.customer_id', order.customerId)
        span.setAttribute('order.item_count', order.items.length)
        span.setAttribute('order.total', order.total)
        return order
      } finally {
        span.end()
      }
    })
  }
}
