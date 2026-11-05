import { createBackendStreamError, createHttpError, isInsufficientCredits } from "./backendError";

it.each([
  { text: "Private billing details", code: "insufficient_credits", retryable: false },
  { text: "Insufficient tokens" },
  "Insufficient tokens",
])("recognizes a structured or legacy credit rejection: %j", (data) => {
  expect(isInsufficientCredits(createBackendStreamError({ data }))).toBe(true);
});

it.each([
  { text: "Provider failure", code: "flow_run_failed" },
  { text: "Provider returned Insufficient tokens in a diagnostic" },
  null,
])("keeps other backend failures distinct: %j", (data) => {
  expect(isInsufficientCredits(createBackendStreamError({ data }))).toBe(false);
});

it.each([
  { detail: "Insufficient tokens" },
  { detail: { code: "insufficient_credits", text: "Private billing details" } },
  { code: "insufficient_credits" },
])("recognizes a credit rejection in an HTTP body: %j", (body) => {
  expect(isInsufficientCredits(createHttpError(400, JSON.stringify(body)))).toBe(true);
});

it("does not treat an unrelated HTTP failure as a credit rejection", () => {
  const error = createHttpError(500, "Internal Server Error");
  expect(isInsufficientCredits(error)).toBe(false);
  expect(error.message).toContain("HTTP error! status: 500");
});
