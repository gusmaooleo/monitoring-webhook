import sendMailMessage from "../api-connections/mail.js";
import sendTelegramMessage from "../api-connections/telegram.js";

export function backendDown(data) {
  const message = `
Backend down: [${new Date().toLocaleDateString()}]
client: ${process.env.CLIENT_NAME ?? "Dev"}
client_ip:${data.commonLabels.instance} 
status: ${data.status}
criticality: ${data.commonLabels.severity} 
down: ${data.alerts[0].startsAt}
up: ${data.status === "firing" ? "-" : data.alerts[0].endsAt}`;
  sendTelegramMessage(message);
  sendMailMessage(message)
}
