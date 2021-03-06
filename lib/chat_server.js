'use strict';

const socketio = require('socket.io');

let io;
let guestNumber = 1;
let nickNames = {};
let namesUsed = [];
let currentRoom = {};

exports.listen = function(server) {
  io = socketio.listen(server);

  io.set('log level', 1);
  io.on('connection', (socket) => {
    guestNumber = assignGuestName(socket, guestNumber, nickNames, namesUsed);

    // Leave default room and then join Lobby
    socket.leave(socket.id);
    joinRoom(socket, 'Lobby');

    // register handlers
    handleClientDisconnection(socket, nickNames, namesUsed);
    handleMessageBroadcasting(socket, nickNames);
    handleNameChangeAttempts(socket, nickNames, namesUsed);
    handleRoomJoining(socket);

    socket.on('rooms', () => {
      const rooms = Object.keys(io.sockets.adapter.rooms);
      socket.emit('rooms', rooms);
    });
  });
};

function assignGuestName(socket, guestNumber, nickNames, namesUsed) {
  const name = `Guest${guestNumber}`;

  nickNames[socket.id] = name;
  namesUsed.push(name);

  socket.emit('nameResult', {
    success: true,
    name: name
  });

  return guestNumber + 1;
}

function joinRoom(socket, room) {
  socket.join(room);
  currentRoom[socket.id] = room;

  socket.emit('joinResult', { room: room });
  socket.broadcast.to(room).emit('message', {
    text: `${nickNames[socket.id]} has joined ${room}.`
  });

  // get clients in the same room
  const usersInRoom = Object.keys(socket.adapter.rooms[room]);

  // send message about other users in the same room
  if(usersInRoom.length > 1) {
    let usersInRoomSummary = `Users currently in ${room}: `;

    usersInRoom.forEach((userSocketId, index) => {
      if(userSocketId != socket.id) {
        if(index > 0) usersInRoomSummary += ', ';
        usersInRoomSummary += nickNames[userSocketId];
      }
    });

    usersInRoomSummary += '.';
    socket.emit('message', { text: usersInRoomSummary })
  }
}

function handleNameChangeAttempts(socket, nickNames, namesUsed) {
  socket.on('nameAttempt', (name) => {
    if(name.match(/\AGuest/)) {
      socket.emit('nameResult', {
        success: false,
        message: 'Names cannot begin with "Guest".'
      });
    } else if(namesUsed.indexOf(name) >= 0) {
      socket.emit('nameResult', {
        success: false,
        message: 'That name is already in use.'
      });
    } else {
      const previousName = nickNames[socket.id];
      const previousNameIndex = namesUsed.indexOf(previousName);

      namesUsed.push(name);
      nickNames[socket.id] = name;
      delete namesUsed[previousNameIndex];

      socket.emit('nameResult', {
        success: true,
        name: name
      });

      socket.broadcast.to(currentRoom[socket.id]).emit('message', {
        text: `${previousName} is now known as ${name}.`
      })
    }
  });
}

function handleMessageBroadcasting(socket) {
  socket.on('message', (message) => {
    socket.broadcast.to(message.room).emit('message', {
      text: `${nickNames[socket.id]}: ${message.text}`
    })
  });
}

function handleRoomJoining(socket) {
  socket.on('join', (room) => {
    // TODO: find out a reason that joining the same room doesn't work
    // and then remove the following line
    if(room.newRoom === currentRoom[socket.id]) return;

    socket.leave(currentRoom[socket.id]);
    joinRoom(socket, room.newRoom);
  });
}

function handleClientDisconnection(socket) {
  socket.on('disconnect', () => {
    const nameIndex = namesUsed.indexOf(nickNames[socket.id]);

    delete namesUsed[nameIndex];
    delete nickNames[socket.id];
  })
}
