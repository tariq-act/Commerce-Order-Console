import { z } from "zod";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
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
