const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const cors = require("cors")

const app = express()

app.use(cors({
  origin: "http://localhost:3000"
}))

const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
  },
})

const rooms = {}

io.on("connection", (socket) => {
  console.log("connected:", socket.id)

  socket.on("create-room", ({ pseudo }, cb) => {
    const roomId = Math.random().toString(36).substring(2, 8)

    rooms[roomId] = {
      host: socket.id,
      players: [{ id: socket.id, pseudo }],
      status: "waiting",
    }

    socket.join(roomId)
    cb(roomId)
  })

  socket.on("join-room", ({ roomId, pseudo }, cb) => {
    const room = rooms[roomId]

    if (!room) return cb({ error: "Room not found" })

    room.players.push({ id: socket.id, pseudo })
    socket.join(roomId)

    io.to(roomId).emit("players-update", room.players)

    cb({ success: true })
  })

  socket.on("start-game", ({ roomId }) => {
    const room = rooms[roomId]

    if (room.host !== socket.id) return
    // if (room.players.length < 2) return

    io.to(roomId).emit("game-started")
  })
})

server.listen(3001, () => {
  console.log("Server running on http://localhost:3001")
})