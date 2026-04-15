// Lightweight DOM-event bus shared between SymbolForm/QuickAddChips
// (producers) and SymbolTable (consumer) for optimistic UI.

export type SymbolRow = {
  id: string;
  name: string;
  fundingRate: number | null;
  nextFundingTime: string | null;
  fundingInterval: number | null;
  updatedAt?: string;
};

export const EVT_PENDING = "symbol:add-pending";
export const EVT_SUCCESS = "symbol:add-success";
export const EVT_ERROR = "symbol:add-error";

export function emitPending(name: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVT_PENDING, { detail: { name } }));
}
export function emitSuccess(row: SymbolRow) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVT_SUCCESS, { detail: { row } }));
}
export function emitError(name: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVT_ERROR, { detail: { name } }));
}
