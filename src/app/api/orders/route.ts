import { errorResponse, successResponse, unexpectedErrorResponse, validationErrorResponse } from "../../../lib/api-response";
import { ZodError } from "zod";
import { createOrder, OrderPlacementError } from "../../../services/order.service";
import { validateOrderQuery } from "../../../lib/validations/order";
import { listOrders } from "../../../services/order-query.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        return errorResponse(400, { code: "VALIDATION_ERROR", message: "Request body must contain valid JSON." });
      }
      throw error;
    }
    return successResponse(createOrder(body), 201);
  } catch (error) {
    if (error instanceof ZodError) return validationErrorResponse(error, "body");
    if (error instanceof OrderPlacementError) {
      return errorResponse(error.status, { code: error.code, message: error.message });
    }
    return unexpectedErrorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const validation = validateOrderQuery(new URL(request.url).searchParams);
    if (!validation.success) return validationErrorResponse(validation.error);

    return successResponse(listOrders(validation.data));
  } catch (error) {
    return unexpectedErrorResponse(error);
  }
}
