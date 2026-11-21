import { createInterface } from "node:readline";
import { PATCH } from "../../src/app/api/orders/[id]/status/route";
import { POST } from "../../src/app/api/orders/[id]/cancel/route";
import { db } from "../../src/db";

const input = createInterface({ input: process.stdin });
input.once("line", async (payload) => {
  try {
    const { id, operation, status } = JSON.parse(payload) as {
      id: string;
      operation: "status" | "cancel";
      status?: string;
    };
    const context = { params: Promise.resolve({ id }) };
    const response =
      operation === "status"
        ? await PATCH(
            new Request(`http://localhost/api/orders/${id}/status`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status }),
            }),
            context,
          )
        : await POST(
            new Request(`http://localhost/api/orders/${id}/cancel`, { method: "POST" }),
            context,
          );
    console.log(JSON.stringify({ status: response.status, body: await response.json() }));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    db.$client.close();
    input.close();
    process.stdin.pause();
  }
});
console.log("READY");
