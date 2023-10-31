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

const addUser = (userID, username, socketID, roomsAllow) => usersConnected[userID] = { username: username, private: socketID, roomsAllow };
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
            console.log(user);
            socket.emit("getUser", user);

            if (!user) return null;
            const userRoomsID = [];
            user.rooms.forEach((room) => userRoomsID.push(room.id))
            const rooms = await DB.collection('rooms').find({
                id: { $in: userRoomsID }
            }).toArray();
            socket.emit("getRooms", rooms);
            addUser(userID, user.name, socket.id, user.rooms);
        });

        //Room events
        socket.on("joinRoom", async (roomID, userID) => {
            socket.join(roomID);
            const user = await DB.collection("users").findOne({id: userID});
            for(let index in user.rooms) {
                if(user.rooms[index].id === roomID) {
                    user.rooms[index].lastCheck = new Date();
                    user.rooms[index].hasNotification = false;
                }
            }
            DB.collection("users").updateOne({id: user.id}, {$set: user}, {upsert: false});
        });

        socket.on("leaveRoom", (roomID) => {
            socket.leave(roomID);
        });

        socket.on("createRoom", (room, users) => {
            users.forEach(user => {
                const privateRoom = usersConnected[user.id].private;

                socket.join(privateRoom);
                socket.to(privateRoom).emit("newRoom", room);
                DB.collection("users").findOne({ id: user.id }).then(rUser => {
                    if (!rUser) return;
                    rUser.rooms.push({ id: room.id, lastCheck: null });
                    DB.collection("users").updateOne({ id: rUser.id }, { $set: rUser }, { upsert: false });
                });
                socket.leave(privateRoom);
            });
            socket.emit("newRoom", room);
            DB.collection("rooms").insertOne(room);
        });

        //User events
        socket.on("createUser", async (user) => {
            await DB.collection('users').insertOne(user);
            socket.emit("getUser", user);
        });

        socket.on("getUsers", async () => {
            const users = await DB.collection("users").find().toArray();
            socket.emit("getUsers", users);
        });

        //Message events
        socket.on("sendMessage", async (message, roomID) => {
            const room = await DB.collection('rooms').findOne({ id: roomID });
            if (!room) return null;
            room.messages.unshift(message);
            room.lastUpdate = new Date();
            await DB.collection('rooms').updateOne({ id: roomID }, { $set: room }, { upsert: false });
            socket.to(roomID).emit('receivedMessage', message);
            for (let user in usersConnected) {
                if (!isConnectedInRoom(roomID, usersConnected[user].private)) {
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