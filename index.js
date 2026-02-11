import express from "express";
import { configDotenv } from "dotenv";
import { handleCase } from "./handle-cases/handle-cases.js";
import { DatabaseConfig } from "./config/database-config.js";

configDotenv();
const app = express();
app.use(express.json());
await DatabaseConfig.setupMongoose();

app.post("/alert", (req, res) => {
  handleCase(req.body);
  res.sendStatus(200);
});

app.listen(6000, "0.0.0.0", () => {
  console.log("Hook running on :6000");
});
