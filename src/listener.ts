import { Connection, PublicKey, type Logs } from "@solana/web3.js";
import { logger } from "./utils/logger";

const DLMM_PROGRAM_ID = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");

// Instruction log patterns that indicate position-related activity (not swaps)
const POSITION_LOG_PATTERNS = [
  "InitializePosition",
  "AddLiquidity",
  "RemoveLiquidity",
  "ClosePosition",
];

export type LogCallback = (signature: string) => void;

export class TransactionListener {
  private connection: Connection;
  private subscriptionId: number | null = null;
  private processedSignatures = new Set<string>();
  private readonly maxCacheSize = 1000;
  private reconnectAttempts = 0;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastEventTime = Date.now();

  constructor(
    private rpcHttp: string,
    private rpcWss: string,
    private onRelevantTransaction: LogCallback
  ) {
    this.connection = new Connection(rpcHttp, {
      wsEndpoint: rpcWss,
      commitment: "confirmed",
    });
  }

  getConnection(): Connection {
    return this.connection;
  }

  async start(): Promise<void> {
    logger.info("Starting DLMM transaction listener...");
    await this.subscribe();
    this.startHeartbeat();
  }

  async stop(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.subscriptionId !== null) {
      await this.connection.removeOnLogsListener(this.subscriptionId);
      this.subscriptionId = null;
      logger.info("Listener stopped");
    }
  }

  private async subscribe(): Promise<void> {
    try {
      if (this.subscriptionId !== null) {
        await this.connection.removeOnLogsListener(this.subscriptionId);
      }

      this.subscriptionId = this.connection.onLogs(
        DLMM_PROGRAM_ID,
        (logs: Logs) => {
          this.lastEventTime = Date.now();
          this.reconnectAttempts = 0;
          this.handleLogs(logs);
        },
        "confirmed"
      );

      logger.info({ subscriptionId: this.subscriptionId }, "Subscribed to DLMM program logs");
    } catch (error) {
      logger.error({ error }, "Failed to subscribe to logs");
      await this.reconnect();
    }
  }

  private handleLogs(logs: Logs): void {
    if (logs.err) return;

    const { signature, logs: logMessages } = logs;

    // Dedup
    if (this.processedSignatures.has(signature)) return;
    this.addToCache(signature);

    // Fast pre-filter: check if any log line mentions position-related instructions
    const isPositionRelated = logMessages.some((log) =>
      POSITION_LOG_PATTERNS.some((pattern) => log.includes(pattern))
    );

    if (isPositionRelated) {
      logger.debug({ signature }, "Detected position-related transaction");
      this.onRelevantTransaction(signature);
    }
  }

  private addToCache(signature: string): void {
    this.processedSignatures.add(signature);
    if (this.processedSignatures.size > this.maxCacheSize) {
      const first = this.processedSignatures.values().next().value;
      if (first) this.processedSignatures.delete(first);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      const silenceDuration = Date.now() - this.lastEventTime;
      if (silenceDuration > 5 * 60 * 1000) {
        logger.warn("No events received for 5 minutes, reconnecting...");
        await this.reconnect();
      } else {
        logger.debug({ silenceSec: Math.round(silenceDuration / 1000) }, "Heartbeat OK");
      }
    }, 60_000);
  }

  private async reconnect(): Promise<void> {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
    logger.info({ attempt: this.reconnectAttempts, delayMs: delay }, "Reconnecting...");
    await new Promise((r) => setTimeout(r, delay));

    // Create fresh connection to reset WebSocket
    this.connection = new Connection(this.rpcHttp, {
      wsEndpoint: this.rpcWss,
      commitment: "confirmed",
    });

    await this.subscribe();
  }
}
