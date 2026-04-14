/**
 * Google ADK LlmAgent powered by a local Ollama instance running Qwen3.
 *
 * Model and host can be overridden via environment variables:
 *   OLLAMA_MODEL  – model tag (default: qwen3:8b)
 *   OLLAMA_HOST   – Ollama base URL (default: http://localhost:11434)
 */

import { LlmAgent } from '@google/adk';
import { OllamaLlm } from './ollama-llm';
import { tools } from './tools';

const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen3:8b';

const SYSTEM_PROMPT = `You are an AI assistant for a store administrator.
You help manage orders and products through natural language commands.

You have access to the following capabilities:
- List recent orders (optionally filter by status)
- Look up a specific order by its ID or order number (e.g. "ORD-1001")
- Update an order's status
- List products (optionally search by name)
- Look up a specific product by its UUID
- Update a product's name or description
- Update a product's price

Valid order statuses: pending, confirmed, processing, on_hold, shipped,
partially_shipped, delivered, completed, cancelled, refunded, partially_refunded.

Guidelines:
- When asked to cancel/ship/update an order by order number, first call get_order
  to retrieve the UUID, then call update_order_status with that UUID.
- Always confirm successful changes concisely.
- If an API call returns an error field, explain it clearly and suggest next steps.
- Validate that prices are non-negative before updating.
- Be concise: one short paragraph per response unless a list is genuinely helpful.`;

export const storeAgent = new LlmAgent({
  name: 'store_admin_agent',
  model: new OllamaLlm(OLLAMA_MODEL),
  description: 'Store administration agent for managing orders and products',
  instruction: SYSTEM_PROMPT,
  tools,
});
