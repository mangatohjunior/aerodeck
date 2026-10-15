import { connection } from "next/server";

import { jsonError } from "@/lib/mock-http";
import { getDeployment, logEvents, markDeploymentSucceeded } from "@/lib/mock-store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await context.params;
  if (!getDeployment(id)) {
    return jsonError(404, "Deployment not found.", "not_found");
  }

  const encoder = new TextEncoder();
  const events = logEvents();

  const stream = new ReadableStream({
    async start(controller) {
      for (const event of events) {
        await new Promise((resolve) => setTimeout(resolve, event.delayMs));
        controller.enqueue(encoder.encode(`data: ${event.text}\n\n`));
      }
      markDeploymentSucceeded(id);
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
