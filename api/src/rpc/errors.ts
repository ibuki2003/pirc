export const RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INTERNAL_ERROR: -32603,
  SESSION_NOT_FOUND: -32004,
  HOST_TIMEOUT: -32008,
  PROTOCOL_MISMATCH: -32009,
} as const;
export class RpcError extends Error {
  constructor(public code: number, message: string) { super(message); }
}
