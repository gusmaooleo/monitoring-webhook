import { backendDown } from "./backend-down.js";
import { externalApiDown } from "./api-down.js";
import { backendCameraOffine } from "./camera-off.js";

const knwonCases = {
  backend_down: (data) => backendDown(data),
  external_api_down: (data) => externalApiDown(data),
  camera_offline: (data) => backendCameraOffine(data)
};

export function handleCase(data) {
  console.log(`[${new Date().toDateString()}] Received alert`);
  const caseFunction = knwonCases[data.commonLabels.alertname];
  console.log("[RECEIVED DATA\n", data);
  caseFunction(data);
}
