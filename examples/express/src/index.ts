import express, { Request, Response } from 'express'
import { trace } from '@opentelemetry/api'

const app = express()
app.use(express.json())

// Simulated in-memory order store
const orders: Record<string, { id: string; item: string; qty: number; status: string }> = {}

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'orders-api' })
})

app.get('/orders/:id', (req: Request, res: Response) => {
  const span = trace.getActiveSpan()
  const { id } = req.params

  span?.setAttribute('order.id', id)

  const order = orders[id]
  if (!order) {
    span?.setAttribute('order.found', false)
    res.status(404).json({ error: 'Order not found' })
    return
  }

  span?.setAttribute('order.found', true)
  span?.setAttribute('order.status', order.status)
  res.json(order)
})

app.post('/orders', (req: Request, res: Response) => {
  const span = trace.getActiveSpan()
  const { item, qty } = req.body as { item?: string; qty?: number }

  if (!item || typeof qty !== 'number' || qty < 1) {
    res.status(400).json({ error: 'item and qty (>0) are required' })
    return
  }

  const id = `ord_${Date.now()}`
  const order = { id, item, qty, status: 'pending' }
  orders[id] = order

  span?.setAttribute('order.id', id)
  span?.setAttribute('order.item', item)
  span?.setAttribute('order.qty', qty)

  res.status(201).json(order)
})

const PORT = Number(process.env.PORT ?? 3000)
app.listen(PORT, () => {
  console.log(`orders-api listening on http://localhost:${PORT}`)
})
