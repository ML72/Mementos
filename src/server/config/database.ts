import mongoose from 'mongoose';
import { MONGO_URI } from "../settings";

const connectDB = async () => {
    try {
        mongoose.set('strictQuery', false);
        await mongoose.connect(MONGO_URI);
        console.log('MongoDB connected...');
    } catch(err: any) {
        console.error(err.message);
        process.exit(1);
    }
}

export { connectDB }