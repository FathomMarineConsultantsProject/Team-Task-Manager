export const HISTORICAL_REASON_REQUIRED = "HISTORICAL_REASON_REQUIRED" as const;
export const HISTORICAL_REASON_MESSAGE = "A reason is required because this change affects recorded work history.";

export type ScheduleMutationError = {
  error?: string;
  code?: string;
  requiresReason?: boolean;
  message?: string;
};

export function historicalReasonRequiredResponse() {
  return {
    code: HISTORICAL_REASON_REQUIRED,
    requiresReason: true,
    message: HISTORICAL_REASON_MESSAGE,
    error: HISTORICAL_REASON_MESSAGE,
  };
}

export function isHistoricalReasonRequired(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const error = value as ScheduleMutationError;
  return error.code === HISTORICAL_REASON_REQUIRED && error.requiresReason === true;
}
