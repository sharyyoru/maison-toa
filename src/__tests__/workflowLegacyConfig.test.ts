import assert from "node:assert/strict";
import {
  configWithFlattenedTrigger,
  resolveLegacyWorkflowConfig,
} from "../lib/workflows/legacyConfig";

const nodes = [
  {
    type: "trigger",
    data: {
      triggerType: "appointment_status_changed",
      config: {
        appointment_statuses: ["fait"],
        run_once_per_patient_per_day: true,
      },
    },
  },
];

const resolved = resolveLegacyWorkflowConfig({
  nodes,
  appointment_statuses: ["stale legacy value"],
}, "appointment_status_changed");
assert.deepEqual(resolved.appointment_statuses, ["fait"]);
assert.equal(resolved.run_once_per_patient_per_day, true);

const flattened = configWithFlattenedTrigger(nodes, "appointment_status_changed");
assert.deepEqual(flattened.appointment_statuses, ["fait"]);
assert.equal(flattened.nodes, nodes);

console.log("workflowLegacyConfig.test.ts: all assertions passed");
