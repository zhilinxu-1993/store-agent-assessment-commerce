/**
 * Unit tests for tool handler functions.
 *
 * The api-client module is mocked so no live HTTP server is required.
 * Tests cover: success paths, not-found errors, validation, and edge cases.
 */

import {
  listOrders,
  getOrder,
  updateOrderStatus,
  listProducts,
  getProduct,
  updateProduct,
  updateProductPrice,
} from '../tools';
import { apiClient } from '../api-client';

jest.mock('../api-client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
  ApiCallError: class ApiCallError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = 'ApiCallError';
    }
  },
}));

type ApiCallErrorCtor = new (status: number, code: string, message: string) => Error & {
  code: string;
  status: number;
};
const { ApiCallError: MockApiCallError } = jest.requireMock('../api-client') as {
  ApiCallError: ApiCallErrorCtor;
};

const mockGet = apiClient.get as jest.MockedFunction<typeof apiClient.get>;
const mockPost = apiClient.post as jest.MockedFunction<typeof apiClient.post>;
const mockPut = apiClient.put as jest.MockedFunction<typeof apiClient.put>;

beforeEach(() => jest.clearAllMocks());

describe('listOrders', () => {
  it('returns orders from the API', async () => {
    const fakeOrders = [{ id: '1', orderNumber: 'ORD-1001', status: 'pending' }];
    mockGet.mockResolvedValue({ data: fakeOrders } as never);
    const result = await listOrders({});
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('/orders'));
    expect(result).toEqual({ orders: fakeOrders });
  });

  it('passes status filter through the query string', async () => {
    mockGet.mockResolvedValue({ data: [] } as never);
    await listOrders({ status: 'shipped' });
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('status=shipped'));
  });

  it('returns an error object when the API call fails', async () => {
    mockGet.mockRejectedValue(new MockApiCallError(404, 'NOT_FOUND', 'Not found'));
    const result = await listOrders({});
    expect(result).toMatchObject({ error: expect.stringContaining('Not found') });
  });
});

describe('getOrder', () => {
  it('routes to /orders/:id for a UUID-style identifier', async () => {
    const fakeOrder = { id: 'abc-123', orderNumber: 'ORD-1001' };
    mockGet.mockResolvedValue(fakeOrder as never);
    const result = await getOrder({ identifier: 'abc-123' });
    expect(mockGet).toHaveBeenCalledWith('/orders/abc-123');
    expect(result).toEqual({ order: fakeOrder });
  });

  it('routes to /orders/number/:num for ORD-xxx identifiers', async () => {
    mockGet.mockResolvedValue({ id: 'abc-123' } as never);
    await getOrder({ identifier: 'ORD-1001' });
    expect(mockGet).toHaveBeenCalledWith('/orders/number/ORD-1001');
  });

  it('returns an error object when the order is not found', async () => {
    mockGet.mockRejectedValue(new MockApiCallError(404, 'ORDER_NOT_FOUND', 'Order not found'));
    const result = await getOrder({ identifier: 'ORD-9999' });
    expect(result).toMatchObject({ error: expect.stringContaining('Order not found') });
  });
});

describe('updateOrderStatus', () => {
  it('calls POST /orders/:id/status with the new status', async () => {
    mockPost.mockResolvedValue({ id: 'abc', status: 'shipped' } as never);
    const result = await updateOrderStatus({ orderId: 'abc', status: 'shipped' });
    expect(mockPost).toHaveBeenCalledWith('/orders/abc/status', { status: 'shipped' });
    expect(result).toMatchObject({ success: true });
  });

  it('includes reason in the request body when provided', async () => {
    mockPost.mockResolvedValue({ id: 'abc', status: 'cancelled' } as never);
    await updateOrderStatus({ orderId: 'abc', status: 'cancelled', reason: 'customer request' });
    expect(mockPost).toHaveBeenCalledWith('/orders/abc/status', {
      status: 'cancelled',
      reason: 'customer request',
    });
  });

  it('rejects invalid status values without calling the API', async () => {
    const result = await updateOrderStatus({ orderId: 'abc', status: 'flying' });
    expect(mockPost).not.toHaveBeenCalled();
    expect(result).toMatchObject({ error: expect.stringContaining('"flying"') });
  });

  it('returns an error object when the API returns 404', async () => {
    mockPost.mockRejectedValue(new MockApiCallError(404, 'ORDER_NOT_FOUND', 'Order not found'));
    const result = await updateOrderStatus({ orderId: 'bad-id', status: 'cancelled' });
    expect(result).toMatchObject({ error: expect.stringContaining('Order not found') });
  });
});

describe('listProducts', () => {
  it('returns products from the API', async () => {
    const fakeProducts = [{ id: 'p1', name: 'Headphones' }];
    mockGet.mockResolvedValue({ data: fakeProducts } as never);
    const result = await listProducts({});
    expect(result).toEqual({ products: fakeProducts });
  });

  it('passes search term through the query string', async () => {
    mockGet.mockResolvedValue({ data: [] } as never);
    await listProducts({ search: 'headphones' });
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('search=headphones'));
  });
});

describe('getProduct', () => {
  it('calls GET /products/:id and returns the product', async () => {
    const fakeProduct = { id: 'p1', name: 'Headphones' };
    mockGet.mockResolvedValue(fakeProduct as never);
    const result = await getProduct({ productId: 'p1' });
    expect(mockGet).toHaveBeenCalledWith('/products/p1');
    expect(result).toEqual({ product: fakeProduct });
  });

  it('returns an error object when the product is not found', async () => {
    mockGet.mockRejectedValue(new MockApiCallError(404, 'PRODUCT_NOT_FOUND', 'Product not found'));
    const result = await getProduct({ productId: 'bad' });
    expect(result).toMatchObject({ error: expect.stringContaining('Product not found') });
  });
});

describe('updateProduct', () => {
  it('calls PUT /products/:id with the provided fields', async () => {
    mockPut.mockResolvedValue({ id: 'p1', name: 'New Name' } as never);
    const result = await updateProduct({ productId: 'p1', name: 'New Name' });
    expect(mockPut).toHaveBeenCalledWith('/products/p1', { name: 'New Name' });
    expect(result).toMatchObject({ success: true });
  });

  it('returns an error if neither name nor description is provided', async () => {
    const result = await updateProduct({ productId: 'p1' });
    expect(mockPut).not.toHaveBeenCalled();
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  it('sends only description when name is omitted', async () => {
    mockPut.mockResolvedValue({ id: 'p1' } as never);
    await updateProduct({ productId: 'p1', description: 'Great product' });
    expect(mockPut).toHaveBeenCalledWith('/products/p1', { description: 'Great product' });
  });
});

describe('updateProductPrice', () => {
  it('looks up the default variant then updates the price', async () => {
    mockGet.mockResolvedValue({ variants: [{ id: 'v1', isDefault: false }, { id: 'v2', isDefault: true }] } as never);
    mockPut.mockResolvedValue({ id: 'v2', price: 49.99 } as never);
    const result = await updateProductPrice({ productId: 'p1', price: 49.99 });
    expect(mockGet).toHaveBeenCalledWith('/products/p1');
    expect(mockPut).toHaveBeenCalledWith('/products/p1/variants/v2', { price: 49.99 });
    expect(result).toMatchObject({ success: true });
  });

  it('uses the supplied variantId without fetching the product', async () => {
    mockPut.mockResolvedValue({ id: 'v5', price: 9.99 } as never);
    await updateProductPrice({ productId: 'p1', price: 9.99, variantId: 'v5' });
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPut).toHaveBeenCalledWith('/products/p1/variants/v5', { price: 9.99 });
  });

  it('rejects negative prices without calling the API', async () => {
    const result = await updateProductPrice({ productId: 'p1', price: -5 });
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPut).not.toHaveBeenCalled();
    expect(result).toMatchObject({ error: expect.stringContaining('non-negative') });
  });

  it('returns an error when the product has no variants', async () => {
    mockGet.mockResolvedValue({ variants: [] } as never);
    const result = await updateProductPrice({ productId: 'p1', price: 10 });
    expect(result).toMatchObject({ error: expect.stringContaining('no variants') });
  });

  it('returns an error when the API call fails', async () => {
    mockGet.mockRejectedValue(new MockApiCallError(404, 'PRODUCT_NOT_FOUND', 'Not found'));
    const result = await updateProductPrice({ productId: 'bad', price: 10 });
    expect(result).toMatchObject({ error: expect.any(String) });
  });
});
