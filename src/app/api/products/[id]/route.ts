import {
  errorResponse,
  successResponse,
  unexpectedErrorResponse,
  validationErrorResponse,
} from "../../../../lib/api-response";
import { productIdParamsSchema } from "../../../../lib/validations/product";
import { getProductById } from "../../../../services/product.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const validation = productIdParamsSchema.safeParse(await context.params);
    if (!validation.success) return validationErrorResponse(validation.error);

    const product = getProductById(validation.data.id);
    if (!product) {
      return errorResponse(404, { code: "NOT_FOUND", message: "Product not found." });
    }
    return successResponse(product);
  } catch (error) {
    return unexpectedErrorResponse(error);
  }
}
