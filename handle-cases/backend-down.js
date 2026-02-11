import sendMailMessage from "../api-connections/mail.js";
import sendTelegramMessage from "../api-connections/telegram.js";
import { buildAlertMessage } from "./message-template.js";

export function backendDown(data) {
  const message = buildAlertMessage({
    title: "Backend indisponivel",
    data,
    resourceFields: [{ label: "Servico", value: "Backend principal" }],
    extraFields: [
      { label: "Regra de alerta", value: data?.commonLabels?.alertname },
    ],
  });

  sendTelegramMessage(message);
  sendMailMessage(message);
}
