import { successResponse, unexpectedErrorResponse, validationErrorResponse } from "../../../lib/api-response";
import { validateProductQuery } from "../../../lib/validations/product";
import { listProducts } from "../../../services/product.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const validation = validateProductQuery(new URL(request.url).searchParams);
    if (!validation.success) return validationErrorResponse(validation.error);

    return successResponse(listProducts(validation.data));
  } catch (error) {
    return unexpectedErrorResponse(error);
  }
}
