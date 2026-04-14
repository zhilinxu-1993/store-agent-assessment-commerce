/**
 * Unit tests for agent configuration.
 *
 * Strategy: replace LlmAgent with a simple class that stores its constructor
 * args on `this`, then cast storeAgent to inspect those args directly.
 */

jest.mock('../ollama-llm', () => ({
  OllamaLlm: jest.fn().mockImplementation((model: string) => ({ _isOllamaLlm: true, model })),
}));

jest.mock('@google/adk', () => ({
  LlmAgent: class {
    readonly _cfg: Record<string, unknown>;
    constructor(cfg: Record<string, unknown>) { this._cfg = cfg; }
  },
  FunctionTool: jest.fn().mockImplementation((opts: Record<string, unknown>) => opts),
  Runner: jest.fn(),
  InMemorySessionService: jest.fn(),
  isFinalResponse: jest.fn(),
  stringifyContent: jest.fn(),
}));

import { storeAgent } from '../agent';

type AgentCfg = {
  _cfg: {
    name: string;
    model: { _isOllamaLlm: boolean; model: string };
    tools: Array<{ name: string }>;
    instruction: string;
  };
};

describe('storeAgent', () => {
  const cfg = (storeAgent as unknown as AgentCfg)._cfg;

  it('storeAgent is created', () => {
    expect(storeAgent).toBeDefined();
    expect(cfg).toBeDefined();
  });

  it('has the correct agent name', () => {
    expect(cfg.name).toBe('store_admin_agent');
  });

  it('uses OllamaLlm as the model', () => {
    expect(cfg.model._isOllamaLlm).toBe(true);
    expect(cfg.model.model).toBe(process.env.OLLAMA_MODEL ?? 'qwen3:8b');
  });

  it('registers all 7 tools', () => {
    expect(cfg.tools).toHaveLength(7);
  });

  it('includes order-management tool names', () => {
    const names = cfg.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['list_orders', 'get_order', 'update_order_status']));
  });

  it('includes product-management tool names', () => {
    const names = cfg.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['list_products', 'get_product', 'update_product', 'update_product_price']));
  });

  it('system instruction covers order status changes', () => {
    expect(cfg.instruction).toMatch(/status/i);
    expect(cfg.instruction).toMatch(/cancel/i);
  });

  it('system instruction covers product price updates', () => {
    expect(cfg.instruction).toMatch(/price/i);
  });
});
