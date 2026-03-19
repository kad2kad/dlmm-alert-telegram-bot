import TelegramBot from "node-telegram-bot-api";
import { logger } from "./utils/logger";
import type { DLMMEvent } from "./types";
import { EventType } from "./types";
import type { WalletStore } from "./wallet-store";

const EVENT_LABELS: Record<EventType, string> = {
  [EventType.POSITION_OPENED]: "Position Opened",
  [EventType.LIQUIDITY_ADDED]: "Liquidity Added",
  [EventType.LIQUIDITY_REMOVED]: "Liquidity Removed",
  [EventType.POSITION_CLOSED]: "Position Closed",
};

const EVENT_EMOJI: Record<EventType, string> = {
  [EventType.POSITION_OPENED]: "\u{1F7E2}",
  [EventType.LIQUIDITY_ADDED]: "\u{1F4B0}",
  [EventType.LIQUIDITY_REMOVED]: "\u{1F4E4}",
  [EventType.POSITION_CLOSED]: "\u{1F534}",
};

export class TelegramNotifier {
  private bot: TelegramBot;
  private chatId: string;
  private walletStore: WalletStore;

  constructor(botToken: string, chatId: string, walletStore: WalletStore) {
    this.chatId = chatId;
    this.walletStore = walletStore;
    this.bot = new TelegramBot(botToken, { polling: true });

    this.setupCommands();
  }

  private setupCommands(): void {
    this.bot.onText(/\/addwallet(?:\s+(.+))?/, (msg, match) => {
      if (msg.chat.id.toString() !== this.chatId) return;
      const args = match?.[1]?.trim();
      if (!args) {
        this.bot.sendMessage(msg.chat.id,
          "Usage: `/addwallet <address> [label]`\nExample: `/addwallet 7xKX...abc Whale1`",
          { parse_mode: "Markdown" }
        );
        return;
      }
      const parts = args.split(/\s+/);
      const address = parts[0];
      const label = parts.slice(1).join(" ") || undefined;
      const result = this.walletStore.add(address, label);
      this.bot.sendMessage(msg.chat.id, result.ok ? `\u2705 ${result.message}` : `\u274C ${result.message}`);
    });

    this.bot.onText(/\/removewallet(?:\s+(.+))?/, (msg, match) => {
      if (msg.chat.id.toString() !== this.chatId) return;
      const address = match?.[1]?.trim();
      if (!address) {
        this.bot.sendMessage(msg.chat.id, "Usage: `/removewallet <address>`", { parse_mode: "Markdown" });
        return;
      }
      const result = this.walletStore.remove(address);
      this.bot.sendMessage(msg.chat.id, result.ok ? `\u2705 ${result.message}` : `\u274C ${result.message}`);
    });

    this.bot.onText(/\/wallets/, (msg) => {
      if (msg.chat.id.toString() !== this.chatId) return;
      const wallets = this.walletStore.list();
      if (wallets.size === 0) {
        this.bot.sendMessage(msg.chat.id, "No wallets being monitored.\nUse /addwallet to add one.");
        return;
      }
      let list = "*Monitored Wallets:*\n\n";
      let i = 1;
      for (const [address, label] of wallets) {
        const short = `${address.slice(0, 4)}...${address.slice(-4)}`;
        list += `${i}\\. ${label ? `*${this.escapeMarkdown(label)}* — ` : ""}${short}\n\`${address}\`\n\n`;
        i++;
      }
      this.bot.sendMessage(msg.chat.id, list.trim(), { parse_mode: "MarkdownV2" });
    });

    this.bot.onText(/\/start/, (msg) => {
      if (msg.chat.id.toString() !== this.chatId) return;
      this.bot.sendMessage(msg.chat.id,
        "*DLMM Alert Bot*\n\n" +
        "I monitor Meteora DLMM positions on Solana and send you alerts.\n\n" +
        "*Commands:*\n" +
        "/addwallet `<address> [label]` — Add a wallet\n" +
        "/removewallet `<address>` — Remove a wallet\n" +
        "/wallets — List monitored wallets\n" +
        "/help — Show this message",
        { parse_mode: "Markdown" }
      );
    });

    this.bot.onText(/\/help/, (msg) => {
      if (msg.chat.id.toString() !== this.chatId) return;
      this.bot.sendMessage(msg.chat.id,
        "*DLMM Alert Bot Commands:*\n\n" +
        "/addwallet `<address> [label]` — Add a wallet to monitor\n" +
        "/removewallet `<address>` — Stop monitoring a wallet\n" +
        "/wallets — List all monitored wallets\n" +
        "/help — Show this help message",
        { parse_mode: "Markdown" }
      );
    });

    logger.info("Telegram bot commands registered");
  }

  async sendAlert(event: DLMMEvent): Promise<void> {
    const label = this.walletStore.getLabel(event.walletAddress);
    const walletDisplay = label
      ? `${label} (${event.walletAddress.slice(0, 4)}...${event.walletAddress.slice(-4)})`
      : `${event.walletAddress.slice(0, 4)}...${event.walletAddress.slice(-4)}`;
    const shortPosition = `${event.positionAddress.slice(0, 4)}...${event.positionAddress.slice(-4)}`;
    const shortPair = `${event.lbPairAddress.slice(0, 4)}...${event.lbPairAddress.slice(-4)}`;
    const time = new Date(event.timestamp * 1000).toISOString().replace("T", " ").slice(0, 19);
    const emoji = EVENT_EMOJI[event.type];

    const message = [
      `${emoji} *DLMM Alert: ${EVENT_LABELS[event.type]}*`,
      "",
      `*Wallet:* \`${walletDisplay}\``,
      `*Pair:* \`${shortPair}\``,
      `*Position:* \`${shortPosition}\``,
      `*Instruction:* ${event.instructionName}`,
      `*Time:* ${time} UTC`,
      "",
      `[View on Solscan](https://solscan.io/tx/${event.signature})`,
    ].join("\n");

    try {
      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      });
      logger.info("Telegram alert sent");
    } catch (error) {
      logger.error({ error }, "Failed to send Telegram alert");
    }
  }

  private escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
  }

  stop(): void {
    this.bot.stopPolling();
  }
}
