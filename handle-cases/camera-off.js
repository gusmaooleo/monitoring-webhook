import sendTelegramMessage from "../api-connections/telegram.js";
import { buildAlertMessage } from "./message-template.js";

export function backendCameraOffine(data) {
  const firstAlert = data?.alerts?.[0];
  const message = buildAlertMessage({
    title: "Camera offline",
    data,
    resourceFields: [
      { label: "Nome da camera", value: firstAlert?.labels?.cameraName },
      { label: "IP da camera", value: firstAlert?.labels?.cameraIp },
    ],
    extraFields: [
      { label: "Regra de alerta", value: data?.commonLabels?.alertname },
    ],
  });

  sendTelegramMessage(message);
}
