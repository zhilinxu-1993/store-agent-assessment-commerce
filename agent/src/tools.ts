/**
 * Tool handler functions and Google ADK FunctionTool definitions.
 *
 * Handler functions return plain objects; on API errors they return
 * { error: string } instead of throwing so the agent surfaces the problem
 * gracefully in the conversation.
 */

import { FunctionTool } from '@google/adk';
import { z } from 'zod/v4';
import { apiClient, ApiCallError } from './api-client';

function apiError(err: unknown): { error: string } {
  if (err instanceof ApiCallError) {
    return { error: `${err.message} (code: ${err.code})` };
  }
  return { error: String(err) };
}

// ---------------------------------------------------------------------------
// Order handlers
// ---------------------------------------------------------------------------

export async function listOrders(params: {
  status?: string;
  limit?: number;
}): Promise<unknown> {
  const { status, limit = 10 } = params;
  const url = `/orders?limit=${limit}&sortBy=createdAt&sortOrder=desc${status ? `&status=${status}` : ''}`;

  try {
    const data = await apiClient.get<{ data: unknown[] }>(url);
    const orders = (data as { data?: unknown[] }).data ?? data;
    return { orders };
  } catch (err) {
    return apiError(err);
  }
}

export async function getOrder(params: { identifier: string }): Promise<unknown> {
  const { identifier } = params;
  const isOrderNumber = /^ORD-/i.test(identifier);

  try {
    const order = isOrderNumber
      ? await apiClient.get(`/orders/number/${encodeURIComponent(identifier)}`)
      : await apiClient.get(`/orders/${encodeURIComponent(identifier)}`);
    return { order };
  } catch (err) {
    return apiError(err);
  }
}

const VALID_ORDER_STATUSES = [
  'pending', 'confirmed', 'processing', 'on_hold', 'shipped',
  'partially_shipped', 'delivered', 'completed', 'cancelled',
  'refunded', 'partially_refunded',
] as const;

export async function updateOrderStatus(params: {
  orderId: string;
  status: string;
  reason?: string;
}): Promise<unknown> {
  const { orderId, status, reason } = params;

  if (!(VALID_ORDER_STATUSES as readonly string[]).includes(status)) {
    return { error: `Invalid status "${status}". Valid: ${VALID_ORDER_STATUSES.join(', ')}` };
  }

  try {
    const body: Record<string, string> = { status };
    if (reason) body.reason = reason;
    const order = await apiClient.post(`/orders/${encodeURIComponent(orderId)}/status`, body);
    return { success: true, order };
  } catch (err) {
    return apiError(err);
  }
}

// ---------------------------------------------------------------------------
// ADK FunctionTool definitions (orders)
// ---------------------------------------------------------------------------

export const tools: FunctionTool[] = [
  new FunctionTool({
    name: 'list_orders',
    description: 'List recent orders. Optionally filter by status and cap the number of results.',
    parameters: z.object({
      status: z.string().optional().describe('Filter by order status, e.g. pending, shipped, cancelled'),
      limit: z.number().optional().describe('Maximum number of orders to return (default 10)'),
    }),
    execute: listOrders,
  }),

  new FunctionTool({
    name: 'get_order',
    description: 'Retrieve a single order by its UUID or order number (e.g. "ORD-1001").',
    parameters: z.object({
      identifier: z.string().describe('Order UUID or order number such as ORD-1001'),
    }),
    execute: getOrder,
  }),

  new FunctionTool({
    name: 'update_order_status',
    description:
      'Change the status of an order. ' +
      'Valid statuses: pending, confirmed, processing, on_hold, shipped, ' +
      'partially_shipped, delivered, completed, cancelled, refunded, partially_refunded.',
    parameters: z.object({
      orderId: z.string().describe('The order UUID'),
      status: z.string().describe('The new status value'),
      reason: z.string().optional().describe('Optional reason for the change'),
    }),
    execute: updateOrderStatus,
  }),
];
