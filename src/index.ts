import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import pLimit from 'p-limit';
import { queryLive } from '@indexsupply/indexsupply.js';

// #region Types
interface Webhook {
  url: string;
  method?: 'POST' | 'GET' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
}

interface Subscription {
  name: string;
  // NOTE: You will need to add a `chainId` to each subscription in your `config.json`.
  // For example: "chainId": 8453
  chainId: number;
  query: string;
  signatures: string[];
  webhook: Webhook;
  cursorFile: string;
  // Start from this block if no cursor file exists. Optional.
  initialBlock?: number;
}

interface Config {
  apiKey: string;
  maxParallel: number;
  retry: {
    minMs: number;
    maxMs: number;
  };
  subscriptions: Subscription[];
}
// #endregion

const configPath = path.resolve(process.cwd(), process.env.CONFIG_PATH ?? 'config.json');
const config: Config = require(configPath);

main().catch(err => {
  console.error('A fatal error occurred:', err);
  process.exit(1);
});

async function main() {
  console.log(`Loaded ${config.subscriptions.length} subscriptions from ${configPath}`);
  for (const sub of config.subscriptions) {
    // Run subscriptions in parallel without waiting for them to complete.
    // Each subscription will run in its own resilient loop.
    runSubscription(sub);
  }
}

async function runSubscription(sub: Subscription) {
  const cursorPath = path.resolve(sub.cursorFile);
  const limit = pLimit(config.maxParallel);

  const startBlock = async (): Promise<bigint> => {
    try {
      const cursorStr = await fs.readFile(cursorPath, 'utf-8');
      const cursor = JSON.parse(cursorStr);
      if (typeof cursor === 'number' || typeof cursor === 'string') {
        console.log(`[${sub.name}] Resuming from block ${cursor}`);
        return BigInt(cursor);
      }
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') {
        const startFrom = BigInt(sub.initialBlock ?? 0);
        console.log(`[${sub.name}] No cursor file found at ${cursorPath}. Starting from block ${startFrom}.`);
        return startFrom;
      } else {
        // For any other error, we should probably throw and let the retry loop handle it.
        throw err;
      }
    }
    const fallback = BigInt(sub.initialBlock ?? 0);
    console.warn(`[${sub.name}] Invalid cursor file content. Starting from block ${fallback}.`);
    return fallback;
  };

  let retryCount = 0;
  while (true) {
    try {
      console.log(`[${sub.name}] Starting live query.`);
      const stream = queryLive({
        apiKey: process.env.INDEXSUPPLY_API_KEY ?? config.apiKey,
        chainId: BigInt(sub.chainId),
        query: sub.query,
        signatures: sub.signatures,
        startBlock,
      });

      for await (const block of stream) {
        if (retryCount > 0) {
            console.log(`[${sub.name}] Reconnected successfully.`);
        }
        retryCount = 0; // Reset retry count on successful data
        limit(() => forward(sub, block));
        try {
          const blockNumber = block.cursor?.get?.(BigInt(sub.chainId));
          if (blockNumber !== undefined) {
            await fs.writeFile(cursorPath, JSON.stringify(blockNumber.toString()));
          } else {
            console.warn(`[${sub.name}] Cursor did not contain chainId ${sub.chainId}. Skipping cursor write.`);
          }
        } catch (err) {
            console.error(`[${sub.name}] Failed to write cursor to ${cursorPath}`, err);
        }
      }
    } catch (err) {
      const { minMs, maxMs } = config.retry;
      const backoff = Math.min(minMs * Math.pow(2, retryCount), maxMs);
      retryCount++;

      console.error(`[${sub.name}] Subscription error. Retrying in ${backoff}ms (attempt ${retryCount})`, err);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
}

async function forward(sub: Subscription, block: any) {
    const { webhook } = sub;
    try {
        const payload = JSON.stringify(block);

        const res = await fetch(webhook.url, {
            method: webhook.method ?? 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...webhook.headers,
            },
            body: payload,
        });

        if (res.status !== 200) {
            const resText = await res.text();
            console.error(`[${sub.name}] Webhook failed with status ${res.status}. Request payload: ${payload}. Response: ${resText}`);
            return;
        }

        console.log(`[${sub.name}] Forwarded block ${block.cursor} to ${webhook.url}`);
    } catch (err) {
        console.error(`[${sub.name}] Error forwarding to webhook ${webhook.url}`, err);
    }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && 'code' in error;
} 