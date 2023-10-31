import { Server } from "socket.io";
import { MongoClient } from "mongodb";

const io = new Server({
    cors: {
        origin: "http://localhost:5173"
    }
});

const mongoClient = new MongoClient("mongodb://localhost:27017");
const dbName = "Messenger";

let usersConnected = {};

const addUser = (userID, socketID, roomsAllow) => usersConnected[userID] = {private: socketID, roomsAllow};
const removeUser = (userID) => delete usersConnected[userID];

const isConnectedInRoom = (roomName, socketID) => {
    const rooms = io.sockets.adapter.rooms.get(roomName);
    return rooms && rooms.has(socketID);
}

async function main() {
    const mongo = await mongoClient.connect();
    const DB = mongo.db(dbName);


    io.on("connection", (socket) => {
        socket.on("initialization", async (userID) => {
            const user = await DB.collection('users').findOne({
                id: userID
            });
            if(!user) return null;
            const rooms = await DB.collection('rooms').find({
                id: { $in: user.roomsID }
            }).toArray();
            socket.emit("getRooms", rooms);
            socket.emit("getUser", user);

            addUser(userID, socket.id, user.roomsID);
        });

        //Room events

        socket.on("joinRoom", (roomID) => {
            socket.join(roomID);
        });

        socket.on("leaveRoom", (roomID) => {
            socket.leave(roomID);
        });

        socket.on("createRoom", (room, users) => {
            users.forEach(user => {
                const privateRoom = usersConnected[user.id].private;
                socket.join(privateRoom);
                socket.to(privateRoom).emit("newRoom", room);
                DB.collection("users").findOne({id: user.id}).then(rUser => {
                    if(!rUser) return;
                    rUser.roomsID.push(room.id);
                    DB.collection("users").updateOne({ id: rUser.id }, { $set: rUser }, { upsert: false });
                });
                socket.leave(privateRoom);
            });
            DB.collection("rooms").insertOne(room);
        });

        //User events

        socket.on("createUser", async (user) => {
            await DB.collection('users').insertOne(user);
            socket.emit("getUser", user);
        });

        //Message events
        socket.on("sendMessage", async (message, roomID) => {
            const room = await DB.collection('rooms').findOne({id: roomID});
            if(!room) return null;
            room.messages.unshift(message);
            room.lastUpdate = new Date();
            await DB.collection('rooms').updateOne({id: roomID}, {$set: room}, {upsert: false});
            socket.to(roomID).emit('receivedMessage', message);
            for (let user in usersConnected) {
                if(!isConnectedInRoom(roomID, usersConnected[user].private)) {
                    socket.to(usersConnected[user].private).emit("notification", message, roomID);
                }
            }
            
        });


        socket.on("disconnect", () => {
            removeUser();
        });
    });

    io.listen(3000);
}


main();