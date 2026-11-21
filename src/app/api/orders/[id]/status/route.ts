import { ZodError } from "zod";
import { errorResponse, successResponse, unexpectedErrorResponse, validationErrorResponse } from "../../../../../lib/api-response";
import { OrderTransitionError, updateOrderStatus } from "../../../../../services/order.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        return errorResponse(400, { code: "VALIDATION_ERROR", message: "Request body must contain valid JSON." });
      }
      throw error;
    }
    return successResponse(updateOrderStatus(id, body));
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error, "body");
    if (error instanceof OrderTransitionError) {
      return errorResponse(error.status, { code: error.code, message: error.message });
    }
    return unexpectedErrorResponse(error);
  }
}
