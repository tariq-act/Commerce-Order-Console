import { ZodError } from "zod";
import { errorResponse, successResponse, unexpectedErrorResponse, validationErrorResponse } from "../../../../../lib/api-response";
import { cancelOrder, OrderTransitionError } from "../../../../../services/order.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return successResponse(cancelOrder(id));
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error, "body");
    if (error instanceof OrderTransitionError) {
      return errorResponse(error.status, { code: error.code, message: error.message });
    }
    return unexpectedErrorResponse(error);
  }
}
