export default async function sendTelegramMessage(text) {
  try {
    const token = process.env.BOT_KEY;
    const chat_id = process.env.BOT_CHAT_ID;
    const payload = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id,
          text,
        }),
      },
    );

    const response = await payload.json();
    console.log(response);
  } catch (error) {
    console.log(
      `Falied to send message to Telegram ${process.env.BOT_CHAT_ID} \n`,
    );
    console.error(error);
  }
}
