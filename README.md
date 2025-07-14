# Forwarder for Index Supply SSE into HTTP webhooks

## What

Reads `config.json` for subscriptions, streams live data from [Index Supply](https://indexsupply.com), and forwards it to your webhooks. Handles parallelism, resumes from cursors, and retries on errors.

## Why

[Index Supply's Live Queries](https://www.indexsupply.net/docs#queries-live), powered by SSE, is a great way to get events for your app in real time.

However, for some use cases, you may want to run your app in a serverless environment like Supabase Edge Functions, which are really efficient for blockchain apps (underrated!) but can't listen to SSE.

To get around this, you can host this forwarder on a simple VPS instance, make it listen to the Live Queries, and forward the data to your app via its HTTP endpoints. We also provide a lightweight **Docker image** so you can deploy to container-based platforms like AWS Fargate with zero extra effort.

P.S. If you're from Index Supply, we'd appreciate if you make this forwarder unnecessary by adding webhook support to Live Queries.

## Usage

### Locally

```bash
npm install
npm run start
```

### In Docker

```bash
docker run -d --name indexsupply-forwarder -e CONFIG_PATH=config.json -e INDEXSUPPLY_API_KEY=your-api-key ultrasoundlabs/indexsupply-forwarder
```

## Environment variables

```bash
CONFIG_PATH=config.json
INDEXSUPPLY_API_KEY=your-api-key
```

## Example config

```json
{
  "maxParallel": 4,
  "retry": {
    "minMs": 1000,
    "maxMs": 30000
  },
  "subscriptions": [
    {
      "name": "erc20Transfers",
      "chainId": 8453,
      "query": "select \"from\", \"to\", tokens from transfer",
      "signatures": [
        "Transfer(address indexed from, address indexed to, uint tokens)"
      ],
      "webhook": {
        "url": "https://my-fn.vercel.app/api/transfer",
        "method": "POST",
        "headers": {
          "x-source": "indexsupply"
        }
      },
      "cursorFile": "./cursors/erc20Transfers.json",
      "initialBlock": 1000000
    },
    {
      "name": "uniV3Swaps",
      "query": "select * from uniswap_v3_swap where token0 in ('WETH', 'USDC')",
      "signatures": [],
      "webhook": {
        "url": "https://example.com/uni-swap"
      },
      "cursorFile": "./cursors/uniV3Swaps.json",
      "initialBlock": 1000000
    }
  ]
} 
```