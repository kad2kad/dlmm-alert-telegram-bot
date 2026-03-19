# DLMM Alert Bot (Telegram)

Monitor Meteora DLMM positions on Solana and get Telegram notifications when a wallet opens or closes a position. Supports monitoring multiple wallets, manageable directly from Telegram.

## Project Structure

```
dlmm-alert-telegram/
├── .env.example          # Template — copy to .env and fill in
├── .gitignore
├── package.json
├── tsconfig.json
├── wallets.json          # Auto-created, stores monitored wallets
└── src/
    ├── index.ts          # Main entry point, wires everything together
    ├── config.ts         # Loads & validates .env
    ├── types.ts          # Shared TypeScript types
    ├── listener.ts       # WebSocket subscription to Meteora DLMM logs
    ├── decoder.ts        # Decodes transaction instructions via Anchor IDL
    ├── notifier.ts       # Telegram bot message sender + command handler
    ├── wallet-store.ts   # Multi-wallet storage (persisted to wallets.json)
    └── utils/
        ├── logger.ts     # Structured logging (pino)
        └── retry.ts      # Exponential backoff helper
```

## Prerequisites

- Node.js 18+
- A Solana RPC provider (WebSocket + HTTP) — get a free key from [Helius](https://helius.dev), [QuickNode](https://quicknode.com), or [Triton](https://triton.one)
- A Telegram account

## How to Get Helius RPC Endpoints

1. Sign up at [dashboard.helius.dev](https://dashboard.helius.dev)
2. Go to your **project settings** to find your API key
3. Construct your endpoints (same key for both):
   - **HTTP:** `https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY`
   - **WSS:** `wss://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY`

## How to Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts (give it a name and username)
3. BotFather will give you a **bot token** — save this for `TELEGRAM_BOT_TOKEN`
4. Open the bot you just created and send `/start` (so it can message you)

## How to Get Your Telegram Chat ID

1. Search for **@userinfobot** (or **@RawDataBot**) on Telegram
2. Send it any message
3. It will reply with your **chat ID** (a number like `123456789`) — save this for `TELEGRAM_CHAT_ID`

## How to Run

### 1. Install dependencies

```bash
npm install
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

### 3. Fill in the `.env` values

| Variable | Description | Example |
|---|---|---|
| `SOLANA_RPC_HTTP` | HTTP RPC endpoint | `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY` |
| `SOLANA_RPC_WSS` | WebSocket RPC endpoint | `wss://mainnet.helius-rpc.com/?api-key=YOUR_KEY` |
| `WALLET_ADDRESS` | (Optional) Initial wallet to monitor | `7xKX...abc` |
| `TELEGRAM_BOT_TOKEN` | Bot token from BotFather | `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11` |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID | `123456789` |
| `LOG_LEVEL` | Optional, defaults to `info` | `debug` |

### 4. Start the bot

```bash
npm start
```

The bot will start immediately — no QR scanning needed. Just make sure you've sent `/start` to your bot on Telegram first.

## Telegram Commands

Send these commands to your bot on Telegram:

| Command | Description | Example |
|---|---|---|
| `/addwallet <address> [label]` | Add a wallet to monitor | `/addwallet 7xKX...abc Whale1` |
| `/removewallet <address>` | Stop monitoring a wallet | `/removewallet 7xKX...abc` |
| `/wallets` | List all monitored wallets | `/wallets` |
| `/help` | Show available commands | `/help` |
| `/start` | Welcome message with instructions | `/start` |

Wallets are saved to `wallets.json` and persist across bot restarts. You can also set an initial wallet via `WALLET_ADDRESS` in `.env`.

## What Gets Detected

| Event | Trigger Instructions |
|---|---|
| **Position Opened** | `initialize_position`, `initialize_position2`, `initialize_position_by_operator`, `initialize_position_pda` |
| **Liquidity Added** | `add_liquidity`, `add_liquidity2`, `add_liquidity_by_strategy`, `add_liquidity_by_strategy2`, `add_liquidity_by_weight`, `add_liquidity_one_side`, `add_liquidity_one_side_precise`, `add_liquidity_one_side_precise2` |
| **Liquidity Removed** | `remove_liquidity`, `remove_liquidity2`, `remove_liquidity_by_range`, `remove_liquidity_by_range2`, `remove_all_liquidity` |
| **Position Closed** | `close_position`, `close_position2`, `close_position_if_empty` |

## How It Works

1. **WebSocket subscription** listens for all transactions hitting the Meteora DLMM program (`LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`)
2. **Log pre-filter** checks if the transaction involves position-related instructions (skips swaps — 99% of DLMM traffic)
3. **Instruction decoder** fetches the full transaction and decodes it using the Anchor IDL from `@meteora-ag/dlmm`
4. **Wallet filter** checks if any monitored wallet is in the transaction's account keys
5. **Telegram notifier** sends a formatted message with emoji, event type, wallet label, pair, position address, and a Solscan link

## Reliability

- **Auto-reconnect**: WebSocket subscription reconnects with exponential backoff (1s → 2s → 4s → ... → 30s cap) on connection drops
- **Heartbeat**: If no events are received for 5 minutes, the bot proactively reconnects
- **Deduplication**: Recently processed transaction signatures are cached to avoid duplicate notifications
- **Persistent wallets**: Wallet list is saved to `wallets.json` and survives restarts

## Example Notification

```
🟢 DLMM Alert: Position Opened

Wallet: Whale1 (7xKX...abc)
Pair: 3fE2...def
Position: 9pQ1...ghi
Instruction: initialize_position
Time: 2026-03-20 14:30:00 UTC

View on Solscan
```

## Comparison with WhatsApp Version

| | WhatsApp (`dlmm-alert`) | Telegram (`dlmm-alert-telegram`) |
|---|---|---|
| Setup | Scan QR code | Bot token + chat ID |
| Notifications | No ringtone (same account) | Full push notifications |
| Bot identity | Runs as your account | Separate bot with own username |
| Dependencies | Puppeteer/Chromium (~300MB RAM) | Lightweight HTTP polling (~50MB RAM) |
| Reliability | Session can expire | Stable, official Bot API |
