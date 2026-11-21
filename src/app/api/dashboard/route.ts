import { successResponse, unexpectedErrorResponse } from "../../../lib/api-response";
import { getDashboard } from "../../../services/dashboard.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return successResponse(getDashboard());
  } catch (error) {
    return unexpectedErrorResponse(error);
  }
}
