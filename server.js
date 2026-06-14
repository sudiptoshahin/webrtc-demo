const express = require('express');
const path = require('path');
const { Server } = require('socket.io');
const app = express();

app.use(express.static(path.join(__dirname, 'public')));
//  route
app.get('/entry', (req, res) => {
    res.sendFile(`${__dirname}/public/entry.html`);
});

app.get('/', (req, res) => {
    res.sendFile(`${__dirname}/public/index.html`);
});
//  route-ends

const server = app.listen(3000, () => {
    console.log('server runs at http://127.0.0.1:3000');
});

var userConnections = [];

const io = new Server(server);
io.on("connection", (socket) => {
    console.log('connected socket-id: ', socket.id);

    socket.on("userconnect", (data) => {
        console.log('userconnect', data.displayNamebn, data.meetingId);

        //  OTHER-USERS
        var otherUsers = userConnections.filter((p) => p.meeting_id === data.meetingId);

        //  STORE USER CONNECTION INFORMATION
        userConnections.push({
            connectionId: socket.id,
            userId: data.displayName,
            meeting_id: data.meetingId
        });

        otherUsers.forEach((v) => {
            socket.to(v.connectionId).emit("inform_others_about_me", {
                otherUserId: data.displayName,
                connectionId: socket.id,

            });
        });

        socket.emit("inform_me_about_other_user", otherUsers);

    });

    //  GET THE OFFER FROM CLIENT AND SEND IT TO OTHER USERS
    socket.on("SDPProcess", (data) => {
        socket.to(data.toConnectionId).emit("SDPProcess", {
            message: data.message,
            fromConnectionId: socket.id
        });
    });


});