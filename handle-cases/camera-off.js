import sendTelegramMessage from "../api-connections/telegram.js";

export function backendCameraOffine(data) {
  const message = `
Camera down: [${new Date().toLocaleDateString()}] 
client: ${process.env.CLIENT ?? "Dev"} 
client_ip: ${process.env.CLIENT_IP ?? "localhost"}
camera_name: ${data.alerts[0].labels.cameraName}
camera_ip: ${data.alerts[0].labels.cameraIp}
status: ${data.status}
criticality: ${data.commonLabels.severity} 
down: ${data.alerts[0].startsAt}
up: ${data.status === "firing" ? "-" : data.alerts[0].endsAt}`;
  sendTelegramMessage(message)
}
