import "dotenv/config";
import type { AppConfig } from "./types";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config: AppConfig = Object.freeze({
  solanaRpcHttp: requireEnv("SOLANA_RPC_HTTP"),
  solanaRpcWss: requireEnv("SOLANA_RPC_WSS"),
  walletAddress: process.env.WALLET_ADDRESS || "",
  telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
  telegramChatId: requireEnv("TELEGRAM_CHAT_ID"),
  logLevel: process.env.LOG_LEVEL || "info",
});
