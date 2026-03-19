import { config } from "./config";
import { logger } from "./utils/logger";
import { TransactionListener } from "./listener";
import { fetchAndDecode } from "./decoder";
import { TelegramNotifier } from "./notifier";
import { WalletStore } from "./wallet-store";

async function main() {
  logger.info("Starting DLMM Alert Bot (Telegram)");

  // Initialize wallet store
  const walletStore = new WalletStore();

  // Seed from .env WALLET_ADDRESS if set and not already stored
  if (config.walletAddress && !walletStore.has(config.walletAddress)) {
    walletStore.add(config.walletAddress, "Default");
    logger.info({ wallet: config.walletAddress }, "Added wallet from .env");
  }

  logger.info({ count: walletStore.getAll().length }, "Monitoring wallets");

  // Initialize Telegram bot
  const notifier = new TelegramNotifier(
    config.telegramBotToken,
    config.telegramChatId,
    walletStore
  );

  // Initialize Solana listener
  const listener = new TransactionListener(
    config.solanaRpcHttp,
    config.solanaRpcWss,
    async (signature: string) => {
      try {
        const events = await fetchAndDecode(
          listener.getConnection(),
          signature,
          walletStore.getAll()
        );

        for (const event of events) {
          logger.info(
            { type: event.type, instruction: event.instructionName, signature: signature.slice(0, 16) },
            "DLMM position event detected!"
          );
          await notifier.sendAlert(event);
        }
      } catch (error) {
        logger.error({ error, signature }, "Error processing transaction");
      }
    }
  );

  await listener.start();

  logger.info(
    {
      wallets: walletStore.getAll().length,
      chatId: config.telegramChatId,
    },
    "Bot is running. Listening for DLMM position events..."
  );

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down...");
    await listener.stop();
    notifier.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  logger.error({ error }, "Fatal error");
  process.exit(1);
});
