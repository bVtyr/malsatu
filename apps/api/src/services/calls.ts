/** Подменные номера (call masking). Провайдер выдаёт временный номер, звонок на который переадресуется продавцу. */
import { config } from "../config.js";

export interface CallMaskingProvider {
  allocate(callerPhone: string, calleePhone: string, ttlMinutes: number): Promise<{ proxyNumber: string; ref?: string }>;
  release(ref: string): Promise<void>;
}

const POOL = ["+77270000101", "+77270000102", "+77270000103", "+77270000104", "+77270000105"];
let i = 0;
const mock: CallMaskingProvider = {
  async allocate() { const n = POOL[i++ % POOL.length]!; return { proxyNumber: n, ref: `mock-${i}` }; },
  async release() {},
};

// Для zadarma/twilio: реализация через их API (callback-номера / Proxy Service). Оставлен единый интерфейс.
export const callMasking: CallMaskingProvider = mock;
export const MASK_TTL_MINUTES = 60 * 24;
export const providerName = config.CALL_MASKING_PROVIDER;
