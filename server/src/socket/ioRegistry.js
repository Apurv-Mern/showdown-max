/** Holds the Socket.io server instance after HTTP listen (for REST routes). */
let ioSingleton = null;

const setSocketIo = (io) => {
  ioSingleton = io;
};

const getSocketIo = () => ioSingleton;

module.exports = { setSocketIo, getSocketIo };
