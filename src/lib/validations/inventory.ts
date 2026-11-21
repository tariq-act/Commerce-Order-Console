import { z } from "zod";
import { paginationQuerySchema } from "./pagination";
import { productIdParamsSchema } from "./product";
import { queryParametersToObject } from "./query";

export const inventoryProductParamsSchema = z.object({
  productId: productIdParamsSchema.shape.id,
});

const inventoryDetailQuerySchema = z.strictObject({});

export function validateInventoryDetailQuery(parameters: URLSearchParams) {
  return inventoryDetailQuerySchema.safeParse(queryParametersToObject(parameters));
}

export function validateInventoryMovementQuery(parameters: URLSearchParams) {
  return paginationQuerySchema.safeParse(queryParametersToObject(parameters));
}
