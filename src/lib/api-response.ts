import type { ZodError } from "zod";

export type ApiSuccess<T> = { success: true; data: T };
export type ApiError = {
  success: false;
  error: {
    code: "VALIDATION_ERROR" | "NOT_FOUND" | "INTERNAL_SERVER_ERROR";
    message: string;
    details?: { field: string; message: string }[];
  };
};

const headers = { "Cache-Control": "no-store" };

export function successResponse<T>(data: T) {
  return Response.json({ success: true, data } satisfies ApiSuccess<T>, { headers });
}

export function errorResponse(status: number, error: ApiError["error"]) {
  return Response.json({ success: false, error } satisfies ApiError, { status, headers });
}

export function validationErrorResponse(error: ZodError) {
  return errorResponse(400, {
    code: "VALIDATION_ERROR",
    message: "Invalid request parameters.",
    details: error.issues.map((issue) => ({
      field: issue.path.join(".") || "query",
      message: issue.message,
    })),
  });
}

export function unexpectedErrorResponse(error: unknown) {
  console.error("API request failed:", error);
  return errorResponse(500, {
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred.",
  });
}
