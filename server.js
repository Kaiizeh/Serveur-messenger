import { Server } from "socket.io";
import { MongoClient } from "mongodb";

const io = new Server({
    cors: {
        origin: "http://localhost:5173"
    }
});

const mongoClient = new MongoClient("mongodb://localhost:27017");
const dbName = "Messenger";


async function main() {
    const mongo = await mongoClient.connect();
    const DB = mongo.db(dbName);


    io.on("connection", (socket) => {
        console.log("new socket is connected...");



        socket.on("joinRooms", async (userID) => {
            const rooms = await DB.collection('rooms').find({
                userID
            }).toArray()
            socket.join(rooms);
            console.log("Rooms joined", [...rooms, "DrzSA423F"]);
        });

        socket.on("sendMessage", (message, room) => {
            socket.to(room).emit("receivedMessage", message);
        });
    });
    
    io.listen(3000);
}


main();