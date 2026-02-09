import sendTelegramMessage from "../api-connections/telegram.js";

export function externalApiDown(data) {
  const message = `
Yolo down: [${new Date().toLocaleDateString()}] 
client: ${data.commonLabels.clientName}
client_ip: ${data.commonLabels.instance} 
status: ${data.status}
criticality: ${data.commonLabels.severity} 
down: ${data.alerts[0].startsAt}
up: ${data.status === "firing" ? "-" : data.alerts[0].endsAt}`;
  console.log(message);
  sendTelegramMessage(message);
}