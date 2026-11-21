import { z } from "zod";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly outcomeUnknown = false,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

// Validate the JSON envelope and data before allowing it into the query cache.
// Never display raw HTTP bodies, proxy HTML, or internal server diagnostics.
export async function apiGet<T>(
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new ApiClientError("Unable to load data. Please try again.", response.status);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiClientError("The server returned an unreadable response.", response.status);
  }
  const result = z.object({ success: z.literal(true), data: schema }).safeParse(body);
  if (!result.success)
    throw new ApiClientError("The server returned an unexpected response.", response.status);
  return result.data.data;
}

// A failed write is never retried here: a lost response may follow a commit.
export async function apiPost<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ApiClientError(
      "The request outcome could not be confirmed.",
      undefined,
      undefined,
      true,
    );
  }
  if (!response.ok) {
    let code: string | undefined;
    try {
      const result = z
        .object({ success: z.literal(false), error: z.object({ code: z.string() }) })
        .safeParse(await response.json());
      if (result.success) code = result.data.error.code;
    } catch {
      /* Error bodies may be non-JSON; never display raw text. */
    }
    throw new ApiClientError("Unable to submit the request.", response.status, code);
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new ApiClientError(
      "The request outcome could not be confirmed.",
      response.status,
      undefined,
      true,
    );
  }
  const result = z.object({ success: z.literal(true), data: schema }).safeParse(value);
  if (!result.success)
    throw new ApiClientError(
      "The request outcome could not be confirmed.",
      response.status,
      undefined,
      true,
    );
  return result.data.data;
}
