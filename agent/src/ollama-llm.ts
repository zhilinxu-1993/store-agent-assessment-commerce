/**
 * Custom BaseLlm implementation that routes requests to a locally-running
 * llama-server (llama.cpp) instance via its OpenAI-compatible API.
 *
 * ADK uses the Gemini API Content format internally.  This adapter handles
 * the bidirectional conversion between that format and the OpenAI chat format.
 *
 * Environment variables:
 *   LLAMA_HOST  – llama-server base URL (default: http://localhost:11435)
 *   OLLAMA_HOST – legacy alias for LLAMA_HOST (kept for backwards-compat)
 */

import { BaseLlm } from '@google/adk';
import type { BaseLlmConnection } from '@google/adk';
import type { LlmRequest, LlmResponse } from '@google/adk';
import type { Content, Part, Schema, Tool as GenaiTool } from '@google/genai';

// ---------------------------------------------------------------------------
// Schema normalisation (Gemini uppercase types → OpenAPI lowercase types)
// ---------------------------------------------------------------------------

function normalizeSchema(schema: Schema | undefined): Record<string, unknown> {
  if (!schema) return { type: 'object', properties: {} };

  const out: Record<string, unknown> = {};

  if (schema.type) {
    out.type = String(schema.type).toLowerCase(); // "OBJECT" → "object"
  }
  if (schema.description) out.description = schema.description;
  if (schema.properties) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]) => [k, normalizeSchema(v as Schema)]),
    );
  }
  if (schema.required) out.required = schema.required;
  if (schema.items) out.items = normalizeSchema(schema.items as Schema);
  if (schema.enum) out.enum = schema.enum;

  return out;
}

// ---------------------------------------------------------------------------
// Types for OpenAI-compatible API
// ---------------------------------------------------------------------------

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string | Record<string, unknown> };
      }>;
    };
    finish_reason: string;
  }>;
}

// ---------------------------------------------------------------------------
// ADK Content[] → OpenAI Message[] conversion
// ---------------------------------------------------------------------------

function extractText(content: Content | string): string {
  if (typeof content === 'string') return content;
  return (
    content.parts
      ?.map((p: Part) => (p as { text?: string }).text ?? '')
      .join('') ?? ''
  );
}

function contentToOpenAIMessages(contents: Content[]): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [];

  for (const content of contents) {
    const role = content.role ?? 'user';
    const parts = content.parts ?? [];

    const textParts = parts.filter((p) => (p as { text?: string }).text !== undefined);
    const functionCallParts = parts.filter(
      (p) => (p as { functionCall?: unknown }).functionCall !== undefined,
    );
    const functionResponseParts = parts.filter(
      (p) => (p as { functionResponse?: unknown }).functionResponse !== undefined,
    );

    if (functionResponseParts.length > 0) {
      for (const part of functionResponseParts) {
        const fr = (part as { functionResponse: { name?: string; response?: unknown } })
          .functionResponse;
        messages.push({
          role: 'tool',
          tool_call_id: fr.name ?? '',
          content: JSON.stringify(fr.response ?? {}),
        });
      }
    } else if (functionCallParts.length > 0) {
      const tool_calls = functionCallParts.map((part, i) => {
        const fc = (part as { functionCall: { name?: string; args?: Record<string, unknown> } })
          .functionCall;
        return {
          id: `call_${i}`,
          type: 'function' as const,
          function: {
            name: fc.name ?? '',
            arguments: JSON.stringify(fc.args ?? {}),
          },
        };
      });
      messages.push({ role: 'assistant', content: '', tool_calls });
    } else if (textParts.length > 0) {
      const text = textParts.map((p) => (p as { text?: string }).text ?? '').join('');
      messages.push({
        role: role === 'model' ? 'assistant' : 'user',
        content: text,
      });
    }
  }

  return messages;
}

// ---------------------------------------------------------------------------
// OpenAI response → ADK LlmResponse conversion
// ---------------------------------------------------------------------------

function openAIResponseToLlmResponse(response: OpenAIResponse): LlmResponse {
  const choice = response.choices[0];
  const msg = choice.message;

  if (msg.tool_calls && msg.tool_calls.length > 0) {
    const parts: Part[] = msg.tool_calls.map((tc) => {
      let args: Record<string, unknown>;
      if (typeof tc.function.arguments === 'string') {
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = {};
        }
      } else {
        args = tc.function.arguments as Record<string, unknown>;
      }
      return { functionCall: { name: tc.function.name, args } };
    });

    if (msg.content?.trim()) {
      parts.unshift({ text: msg.content });
    }

    return { content: { role: 'model', parts }, turnComplete: true };
  }

  return {
    content: { role: 'model', parts: [{ text: msg.content ?? '' }] },
    turnComplete: true,
  };
}

// ---------------------------------------------------------------------------
// OllamaLlm
// ---------------------------------------------------------------------------

export class OllamaLlm extends BaseLlm {
  private readonly host: string;

  static override readonly supportedModels: Array<string | RegExp> = [/.*/];

  constructor(modelName: string) {
    super({ model: modelName });
    this.host =
      process.env.LLAMA_HOST ??
      process.env.OLLAMA_HOST?.replace(':11434', ':11435') ??
      'http://localhost:11435';
  }

  async *generateContentAsync(
    request: LlmRequest,
    _stream?: boolean,
  ): AsyncGenerator<LlmResponse, void> {
    const messages = contentToOpenAIMessages(request.contents);

    const sysInstruction = request.config?.systemInstruction as Content | string | undefined;
    if (sysInstruction) {
      const text = extractText(sysInstruction);
      if (text) messages.unshift({ role: 'system', content: text });
    }

    const openAITools: OpenAITool[] = [];
    const geminiTools = (request.config?.tools ?? []) as GenaiTool[];
    for (const genaiTool of geminiTools) {
      for (const fd of genaiTool.functionDeclarations ?? []) {
        openAITools.push({
          type: 'function',
          function: {
            name: fd.name ?? '',
            description: fd.description ?? '',
            parameters: normalizeSchema(fd.parameters as Schema | undefined),
          },
        });
      }
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      // Disable Qwen3 thinking/reasoning mode for faster, cleaner responses
      chat_template_kwargs: { thinking: false },
    };
    if (openAITools.length > 0) body.tools = openAITools;

    const res = await fetch(`${this.host}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`llama-server error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as OpenAIResponse;
    yield openAIResponseToLlmResponse(data);
  }

  async connect(_request: LlmRequest): Promise<BaseLlmConnection> {
    throw new Error('OllamaLlm does not support live connections');
  }
}
