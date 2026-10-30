import { defineConfig } from "vitest/config";

// 5 s Standard-Limit war auf langsameren Rechnern (CI, parallele Builds) zu knapp:
// PDF-/Foto-Tests brauchten dort 5-6 s und schlugen nur wegen der Zeit fehl.
export default defineConfig({
  test: {
    testTimeout: 20_000,
  },
});
