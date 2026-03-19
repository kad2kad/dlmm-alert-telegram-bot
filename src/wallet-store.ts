import fs from "fs";
import path from "path";
import { PublicKey } from "@solana/web3.js";
import { logger } from "./utils/logger";

const STORE_PATH = path.join(process.cwd(), "wallets.json");

export class WalletStore {
  private wallets: Map<string, string>; // address -> label

  constructor() {
    this.wallets = new Map();
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const data = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
        for (const [address, label] of Object.entries(data)) {
          this.wallets.set(address, label as string);
        }
        logger.info({ count: this.wallets.size }, "Loaded wallets from store");
      }
    } catch (error) {
      logger.error({ error }, "Failed to load wallet store");
    }
  }

  private save(): void {
    const data = Object.fromEntries(this.wallets);
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
  }

  add(address: string, label?: string): { ok: boolean; message: string } {
    // Validate Solana address
    try {
      new PublicKey(address);
    } catch {
      return { ok: false, message: `Invalid Solana address: ${address}` };
    }

    if (this.wallets.has(address)) {
      return { ok: false, message: `Wallet already being monitored: ${address}` };
    }

    this.wallets.set(address, label || "");
    this.save();
    return { ok: true, message: `Wallet added: ${address}${label ? ` (${label})` : ""}` };
  }

  remove(address: string): { ok: boolean; message: string } {
    if (!this.wallets.has(address)) {
      return { ok: false, message: `Wallet not found: ${address}` };
    }

    this.wallets.delete(address);
    this.save();
    return { ok: true, message: `Wallet removed: ${address}` };
  }

  list(): Map<string, string> {
    return new Map(this.wallets);
  }

  has(address: string): boolean {
    return this.wallets.has(address);
  }

  getAll(): string[] {
    return Array.from(this.wallets.keys());
  }

  getLabel(address: string): string {
    return this.wallets.get(address) || "";
  }
}
