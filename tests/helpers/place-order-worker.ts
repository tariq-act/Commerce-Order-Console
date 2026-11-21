import { createInterface } from "node:readline";
import { POST } from "../../src/app/api/orders/route";
import { db } from "../../src/db";

// A separate process owns a separate SQLite connection for real writer contention.
const input = createInterface({ input: process.stdin });
input.once("line", async (payload) => {
  try {
    const response = await POST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      }),
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
