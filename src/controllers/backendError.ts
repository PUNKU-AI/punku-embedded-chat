/** Keep the credit rejection distinct from temporary backend failures. */
export const INSUFFICIENT_CREDITS = "insufficient_credits";

export function isInsufficientCredits(error: unknown): boolean {
  return !!error && typeof error === "object" &&
    "code" in error && error.code === INSUFFICIENT_CREDITS;
}

export function createBackendStreamError(event: { data?: unknown; message?: unknown }): Error {
  const data = event.data;
  const fields = data && typeof data === "object"
    ? data as Record<string, unknown> : {};
  const text = [data, fields.text, fields.message, fields.detail, event.message]
    .find((value): value is string => typeof value === "string" && !!value.trim());
  // Older servers send only this exact text. Never match arbitrary error substrings.
  const noCredits = fields.code === INSUFFICIENT_CREDITS || text?.trim() === "Insufficient tokens";
  return Object.assign(new Error(text || "The assistant could not complete the response. Please try again."), {
    code: noCredits ? INSUFFICIENT_CREDITS : "ERR_BACKEND_STREAM",
  });
}

export function createHttpError(status: number, body: string): Error {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  if (data && typeof data === "object" && "detail" in data) data = data.detail;
  const error = createBackendStreamError({ data });
  return isInsufficientCredits(error) ? error : new Error(`HTTP error! status: ${status}, body: ${body}`);
}
