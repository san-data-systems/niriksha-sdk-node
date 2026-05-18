import Fastify from 'fastify'
import { trace } from '@opentelemetry/api'

const app = Fastify({ logger: true })

interface Product {
  id: string
  name: string
  price: number
  inStock: boolean
}

// Simulated in-memory product catalog
const catalog: Product[] = [
  { id: 'p1', name: 'Widget Pro', price: 29.99, inStock: true },
  { id: 'p2', name: 'Gadget Lite', price: 9.99, inStock: false },
]

app.get('/health', async () => {
  return { status: 'ok', service: 'product-catalog' }
})

app.get('/products', async (request) => {
  const span = trace.getActiveSpan()
  const { inStock } = request.query as { inStock?: string }

  let results = catalog
  if (inStock !== undefined) {
    const filter = inStock === 'true'
    results = catalog.filter(p => p.inStock === filter)
    span?.setAttribute('filter.inStock', filter)
  }

  span?.setAttribute('products.returned', results.length)
  span?.setAttribute('products.total', catalog.length)
  return results
})

app.post('/products', async (request, reply) => {
  const span = trace.getActiveSpan()
  const body = request.body as Partial<Product>

  if (!body.name || typeof body.price !== 'number') {
    return reply.status(400).send({ error: 'name and price are required' })
  }

  const product: Product = {
    id: `p${catalog.length + 1}`,
    name: body.name,
    price: body.price,
    inStock: body.inStock ?? true,
  }
  catalog.push(product)

  span?.setAttribute('product.id', product.id)
  span?.setAttribute('product.name', product.name)
  span?.setAttribute('product.price', product.price)

  return reply.status(201).send(product)
})

const PORT = Number(process.env.PORT ?? 3001)
app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }
})
