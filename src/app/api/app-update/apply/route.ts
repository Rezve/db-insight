import { spawn } from "child_process";

function sse(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(sse(data)));
      }

      function runCommand(
        cmd: string,
        args: string[],
        label: string
      ): Promise<void> {
        return new Promise((resolve, reject) => {
          send({ type: "log", line: `\n> ${label}\n` });

          const proc = spawn(cmd, args, {
            shell: true,
            env: { ...process.env },
          });

          proc.stdout.on("data", (chunk: Buffer) => {
            const lines = chunk.toString().split("\n");
            for (const line of lines) {
              if (line.trim()) send({ type: "log", line });
            }
          });

          proc.stderr.on("data", (chunk: Buffer) => {
            const lines = chunk.toString().split("\n");
            for (const line of lines) {
              if (line.trim()) send({ type: "log", line });
            }
          });

          proc.on("close", (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`${label} exited with code ${code}`));
            }
          });

          proc.on("error", reject);
        });
      }

      (async () => {
        try {
          await runCommand("git", ["pull"], "git pull");
          await runCommand("npm", ["run", "build"], "npm run build");
          send({ type: "complete" });
        } catch (err) {
          send({
            type: "error",
            message: err instanceof Error ? err.message : "Update failed",
          });
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
