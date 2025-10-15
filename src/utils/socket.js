let ioInstance = null;

function initSocket(server, authMiddleware) {
  const { Server } = require('socket.io');
  const io = new Server(server, {
    cors: { origin: true, credentials: true }
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) return next(new Error('Unauthorized'));
      // Reuse JWT verification from auth middleware
      const jwt = require('jsonwebtoken');
      const User = require('../models/User');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('_id role isActive');
      if (!user || !user.isActive) return next(new Error('Unauthorized'));
      socket.user = { id: user._id.toString(), role: user.role };
      next();
    } catch (e) {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userRoom = `user:${socket.user.id}`;
    socket.join(userRoom);

    socket.on('disconnect', () => {
      // cleanup if needed
    });
  });

  ioInstance = io;
  return io;
}

function emitToUser(userId, event, payload) {
  if (!ioInstance) return;
  ioInstance.to(`user:${userId}`).emit(event, payload);
}

module.exports = { initSocket, emitToUser };


