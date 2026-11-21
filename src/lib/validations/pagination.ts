import { z } from "zod";

const positiveQueryInteger = z
  .string()
  .regex(/^\d+$/, "Must contain only decimal digits.")
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));

export const paginationQuerySchema = z
  .strictObject({
    page: positiveQueryInteger.default(1),
    limit: positiveQueryInteger.pipe(z.number().max(100)).default(20),
  })
  .superRefine(({ page, limit }, context) => {
    if (!Number.isSafeInteger((page - 1) * limit)) {
      context.addIssue({
        code: "custom",
        path: ["page"],
        message: "Pagination offset exceeds the supported integer range.",
      });
    }
  });

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
