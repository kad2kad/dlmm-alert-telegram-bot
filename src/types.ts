export enum EventType {
  POSITION_OPENED = "POSITION_OPENED",
  LIQUIDITY_ADDED = "LIQUIDITY_ADDED",
  LIQUIDITY_REMOVED = "LIQUIDITY_REMOVED",
  POSITION_CLOSED = "POSITION_CLOSED",
}

export interface DLMMEvent {
  type: EventType;
  signature: string;
  timestamp: number;
  walletAddress: string;
  positionAddress: string;
  lbPairAddress: string;
  instructionName: string;
  tokenXMint?: string;
  tokenYMint?: string;
}

export interface AppConfig {
  solanaRpcHttp: string;
  solanaRpcWss: string;
  walletAddress: string;
  telegramBotToken: string;
  telegramChatId: string;
  logLevel: string;
}
