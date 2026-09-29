import mongoose from "mongoose";

const connectDB = async (uri) => {
  mongoose.set("bufferCommands", false);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 10 });
};

export default connectDB;
