import { processImage, type ProcessInput } from "./process";

type Request = { id: number; input: ProcessInput };

const scope = self as unknown as { onmessage: ((e: MessageEvent<Request>) => void) | null; postMessage(message: unknown): void };

scope.onmessage = async (e) => {
  const { id, input } = e.data;
  try {
    scope.postMessage({ id, output: await processImage(input) });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
