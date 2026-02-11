import mongoose from "mongoose";

export class DatabaseConfig {
  static async setupMongoose() {
    const mongodb_url =
      process.env.CLIENT === "Dev"
        ? `mongodb://${process.env.MONGO_IP}:27017/${process.env.CLIENT}`
        : `mongodb://${process.env.MONGO_IP}:27017/${process.env.CLIENT}_V4`;

    await mongoose.connect(mongodb_url);
    mongoose.set("strictPopulate", false);
    return mongoose;
  }
}
