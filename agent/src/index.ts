/**
 * Agent HTTP service – runs on port 3001.
 *
 * POST /chat  { message: string }
 *             → { reply: string; sessionId: string }
 *
 * GET  /health → { status: "ok" }
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import {
  Runner,
  InMemorySessionService,
  isFinalResponse,
  stringifyContent,
} from '@google/adk';
import type { Content } from '@google/genai';
import { storeAgent } from './agent';

const PORT = Number(process.env.AGENT_PORT ?? 3001);
const STORE_ORIGIN = process.env.STORE_ORIGIN ?? 'http://localhost:3000';
const APP_NAME = 'store-admin';
const USER_ID = 'admin';

const app = express();
app.use(cors({ origin: STORE_ORIGIN }));
app.use(express.json());

const sessionService = new InMemorySessionService();

const runner = new Runner({
  agent: storeAgent,
  appName: APP_NAME,
  sessionService,
});

interface ChatRequest {
  message: string;
  sessionId?: string;
}

interface ChatResponse {
  reply: string;
  sessionId: string;
}

app.post('/chat', async (req: Request, res: Response) => {
  const { message, sessionId } = req.body as ChatRequest;

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    // Reuse an existing session (keeps context across turns) or create a new one.
    let session =
      sessionId
        ? await sessionService
            .getSession({ appName: APP_NAME, userId: USER_ID, sessionId })
            .catch(() => null)
        : null;

    if (!session) {
      session = await sessionService.createSession({
        appName: APP_NAME,
        userId: USER_ID,
      });
    }

    const userMessage: Content = {
      role: 'user',
      parts: [{ text: message.trim() }],
    };

    let reply = '';
    for await (const event of runner.runAsync({
      userId: USER_ID,
      sessionId: session.id,
      newMessage: userMessage,
    })) {
      if (isFinalResponse(event)) {
        reply = stringifyContent(event);
        break;
      }
    }

    const response: ChatResponse = { reply, sessionId: session.id };
    res.json(response);
  } catch (err) {
    console.error('[agent] chat error:', err);
    res.status(500).json({ error: 'Agent error. Check server logs.' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`[agent] Listening on http://localhost:${PORT}`);
  console.log(`[agent] Ollama model: ${process.env.OLLAMA_MODEL ?? 'qwen3:8b'}`);
});

export { app };
