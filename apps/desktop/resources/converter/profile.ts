import { log } from "../../src/main/logging";
export function profileStage(stage: string): () => void {
  const start = performance.now();
  return () => {
    if (process.env.VSTUDY_CONVERSION_PROFILE === "1") {
      log(JSON.stringify({ conversionProfile: stage, ms: performance.now() - start }));
    }
  };
}
