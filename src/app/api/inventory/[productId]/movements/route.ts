import {
  errorResponse,
  successResponse,
  unexpectedErrorResponse,
  validationErrorResponse,
} from "../../../../../lib/api-response";
import {
  inventoryProductParamsSchema,
  validateInventoryMovementQuery,
} from "../../../../../lib/validations/inventory";
import { listInventoryMovements } from "../../../../../services/inventory.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ productId: string }> }) {
  try {
    const validation = inventoryProductParamsSchema.safeParse(await context.params);
    if (!validation.success) return validationErrorResponse(validation.error);
    const query = validateInventoryMovementQuery(new URL(request.url).searchParams);
    if (!query.success) return validationErrorResponse(query.error);

    const result = listInventoryMovements(validation.data.productId, query.data);
    if (!result) return errorResponse(404, { code: "NOT_FOUND", message: "Product not found." });
    return successResponse(result);
  } catch (error) {
    return unexpectedErrorResponse(error);
  }
}
