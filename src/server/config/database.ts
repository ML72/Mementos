import mongoose from 'mongoose';
import { MONGO_URI } from "../settings";

const connectDB = async () => {
    try {
        mongoose.set('strictQuery', false);
        await mongoose.connect(MONGO_URI);
        const { host, port, name } = mongoose.connection;
        console.log(`DATABASE: connected to MongoDB at ${host}:${port}/${name}`);

        // From here on the driver reconnects by itself, so log each drop and recovery.
        mongoose.connection.on('disconnected', () => console.error('DATABASE: lost connection to MongoDB, retrying'));
        mongoose.connection.on('reconnected', () => console.log('DATABASE: reconnected to MongoDB'));
    } catch(err: any) {
        console.error(`DATABASE: could not connect to MongoDB: ${err.message}`);
        process.exit(1);
    }
}

export { connectDB }