import {
  errorResponse,
  successResponse,
  unexpectedErrorResponse,
  validationErrorResponse,
} from "../../../../lib/api-response";
import { orderIdParamsSchema } from "../../../../lib/validations/order";
import { getOrderById } from "../../../../services/order-query.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const validation = orderIdParamsSchema.safeParse(await context.params);
    if (!validation.success) return validationErrorResponse(validation.error);

    const order = getOrderById(validation.data.id);
    if (!order) return errorResponse(404, { code: "NOT_FOUND", message: "Order not found." });
    return successResponse(order);
  } catch (error) {
    return unexpectedErrorResponse(error);
  }
}
