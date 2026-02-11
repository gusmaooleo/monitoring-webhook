import sendMailMessage from "../api-connections/mail.js";
import sendTelegramMessage from "../api-connections/telegram.js";
import mongoose from "mongoose";

export async function externalApiDown(data) {
  let message = `
${data.commonLabels.api} down: [${new Date().toLocaleDateString()}] 
client: ${process.env.CLIENT ?? "Dev"}
client_ip:${process.env.CLIENT_IP ?? "localhost"} 
status: ${data.status}
criticality: ${data.commonLabels.severity} 
down: ${data.alerts[0].startsAt}
up: ${data.status === "firing" ? "-" : data.alerts[0].endsAt}`;

  try {
    const collection = mongoose.connection.collection("logs");
    const lastLog = await collection.findOne(
      { tags: data.commonLabels.api },
      { sort: { _id: -1 } },
    );
    message = message.concat("\nlog:\n```json\n", JSON.stringify(lastLog), "\n```")
  } catch (error) {
    console.error(error);
  }
  console.log("[MESSAGE SENT]\n", message)

  sendTelegramMessage(message);
  sendMailMessage(message);
}
