import { backendDown } from "./backend-down.js";
import { externalApiDown } from "./api-down.js";
import { backendCameraOffine } from "./camera-off.js";
import { formatPtBrDateTime } from "./message-template.js";

const knownCases = {
  backend_down: (data) => backendDown(data),
  external_api_down: (data) => externalApiDown(data),
  camera_offline: (data) => backendCameraOffine(data),
};

export function handleCase(data) {
  console.log(`[${formatPtBrDateTime(new Date())}] Alerta recebido`);
  const alertName = data?.commonLabels?.alertname;
  const caseFunction = knownCases[alertName];
  if (!caseFunction) {
    console.log(`[CASE NAO MAPEADO] ${alertName || "nao informado"}`);
    return;
  }

  console.log("[DADOS RECEBIDOS]\n", data);
  caseFunction(data);
}
