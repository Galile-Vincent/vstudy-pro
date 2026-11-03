export function profileStage(stage: string): () => void {
  const start = performance.now();
  return () => {
    if (process.env.VSTUDY_CONVERSION_PROFILE === "1") {
      console.log(JSON.stringify({ conversionProfile: stage, ms: performance.now() - start }));
    }
  };
}
