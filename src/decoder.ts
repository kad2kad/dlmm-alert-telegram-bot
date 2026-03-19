import { BorshInstructionCoder } from "@coral-xyz/anchor";
import { IDL } from "@meteora-ag/dlmm";
import {
  Connection,
  PublicKey,
  type ParsedTransactionWithMeta,
  type PartiallyDecodedInstruction,
} from "@solana/web3.js";
import { logger } from "./utils/logger";
import { withRetry } from "./utils/retry";
import { EventType, type DLMMEvent } from "./types";

const DLMM_PROGRAM_ID = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";

// Anchor IDL decoder returns snake_case names (e.g. "initialize_position")
const INSTRUCTION_EVENT_MAP: Record<string, EventType> = {
  initialize_position: EventType.POSITION_OPENED,
  initialize_position2: EventType.POSITION_OPENED,
  initialize_position_by_operator: EventType.POSITION_OPENED,
  initialize_position_pda: EventType.POSITION_OPENED,
  add_liquidity: EventType.LIQUIDITY_ADDED,
  add_liquidity2: EventType.LIQUIDITY_ADDED,
  add_liquidity_by_strategy: EventType.LIQUIDITY_ADDED,
  add_liquidity_by_strategy2: EventType.LIQUIDITY_ADDED,
  add_liquidity_by_weight: EventType.LIQUIDITY_ADDED,
  add_liquidity_one_side: EventType.LIQUIDITY_ADDED,
  add_liquidity_one_side_precise: EventType.LIQUIDITY_ADDED,
  add_liquidity_one_side_precise2: EventType.LIQUIDITY_ADDED,
  remove_liquidity: EventType.LIQUIDITY_REMOVED,
  remove_liquidity2: EventType.LIQUIDITY_REMOVED,
  remove_liquidity_by_range: EventType.LIQUIDITY_REMOVED,
  remove_liquidity_by_range2: EventType.LIQUIDITY_REMOVED,
  remove_all_liquidity: EventType.LIQUIDITY_REMOVED,
  close_position: EventType.POSITION_CLOSED,
  close_position2: EventType.POSITION_CLOSED,
  close_position_if_empty: EventType.POSITION_CLOSED,
};

// @ts-ignore - IDL type compatibility
const coder = new BorshInstructionCoder(IDL);

export async function fetchAndDecode(
  connection: Connection,
  signature: string,
  walletAddresses: string[]
): Promise<DLMMEvent[]> {
  if (walletAddresses.length === 0) return [];

  const tx = await withRetry(
    () =>
      connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      }),
    { maxAttempts: 3, baseDelayMs: 2000, label: "fetchTransaction" }
  );

  if (!tx) {
    logger.warn({ signature }, "Transaction not found");
    return [];
  }

  // Check if any monitored wallet is involved in this transaction
  const accountKeys = tx.transaction.message.accountKeys.map((k) =>
    typeof k === "string" ? k : k.pubkey.toBase58()
  );

  const matchedWallets = walletAddresses.filter((w) => accountKeys.includes(w));
  if (matchedWallets.length === 0) return [];

  const events: DLMMEvent[] = [];
  const timestamp = tx.blockTime || Math.floor(Date.now() / 1000);

  for (const walletAddress of matchedWallets) {
    // Process outer instructions
    for (const ix of tx.transaction.message.instructions) {
      const event = decodeInstruction(ix, signature, timestamp, walletAddress);
      if (event) events.push(event);
    }

    // Process inner instructions (CPI calls)
    if (tx.meta?.innerInstructions) {
      for (const inner of tx.meta.innerInstructions) {
        for (const ix of inner.instructions) {
          const event = decodeInstruction(ix, signature, timestamp, walletAddress);
          if (event) events.push(event);
        }
      }
    }
  }

  return events;
}

function decodeInstruction(
  ix: any,
  signature: string,
  timestamp: number,
  walletAddress: string
): DLMMEvent | null {
  // Only process DLMM program instructions
  const programId = typeof ix.programId === "string" ? ix.programId : ix.programId?.toBase58();
  if (programId !== DLMM_PROGRAM_ID) return null;

  // Skip already-parsed instructions (native programs)
  if (!("data" in ix) || !ix.data) return null;

  try {
    const decoded = coder.decode(ix.data, "base58");
    if (!decoded) return null;

    const eventType = INSTRUCTION_EVENT_MAP[decoded.name];
    if (!eventType) return null;

    // Extract account addresses from the instruction
    const accounts: string[] = (ix.accounts || []).map((a: any) =>
      typeof a === "string" ? a : a.toBase58()
    );

    // Account layout varies by instruction, but typically:
    // - position is at index 1 for most instructions
    // - lbPair is at index 2 for most instructions
    const positionAddress = accounts[1] || "unknown";
    const lbPairAddress = accounts[2] || "unknown";

    logger.info(
      { instruction: decoded.name, eventType, signature: signature.slice(0, 16) },
      "Decoded DLMM event"
    );

    return {
      type: eventType,
      signature,
      timestamp,
      walletAddress,
      positionAddress,
      lbPairAddress,
      instructionName: decoded.name,
    };
  } catch (error) {
    logger.debug({ error, signature }, "Failed to decode instruction (may be a different version)");
    return null;
  }
}
