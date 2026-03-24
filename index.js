const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const cors = require("cors")

const app = express()

app.use(cors({
  origin: "http://localhost:3000",
  methods: ["GET", "POST"]
}))

const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
})

// Stockage simple en mémoire
const rooms = {}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id)

  // Créer une room
  socket.on("create-room", ({ pseudo, playerId }, cb) => {
    const roomId = Math.random().toString(36).substring(2, 8)

    rooms[roomId] = {
      hostPlayerId: playerId,
      players: [{ playerId, socketId: socket.id, pseudo }],
      status: "waiting"
    }

    socket.join(roomId)
    io.to(roomId).emit("room-update", rooms[roomId])
    cb(roomId)
  })

  // Rejoindre une room
  socket.on("join-room", ({ roomId, pseudo, playerId }, cb) => {
    const room = rooms[roomId]
    if (!room) return cb({ error: "Room not found" })

    const existing = room.players.find(p => p.playerId === playerId)
    if (existing) {
      existing.socketId = socket.id // reconnexion
    } else {
      room.players.push({ playerId, socketId: socket.id, pseudo })
    }

    socket.join(roomId)
    io.to(roomId).emit("room-update", room)
    cb({ success: true })
  })

  // Lancer la partie (seul admin)
  socket.on("start-game", ({ roomId, playerId }) => {
    const room = rooms[roomId]
    if (!room) return
    if (room.hostPlayerId !== playerId) return
    if (room.players.length < 2) return

    room.status = "playing"
    io.to(roomId).emit("room-update", room)
    io.to(roomId).emit("game-started")
  })

  // Kick un joueur (seul admin)
  socket.on("kick-player", ({ roomId, playerId, targetPlayerId }) => {
    const room = rooms[roomId]
    if (!room) return
    if (room.hostPlayerId !== playerId) return

    room.players = room.players.filter(p => p.playerId !== targetPlayerId)

    // prévenir le joueur kické
    const target = room.players.find(p => p.playerId === targetPlayerId)
    if (target) {
      io.to(target.socketId).emit("kicked")
    }

    io.to(roomId).emit("room-update", room)
  })

  // Déconnexion
  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id)
    // Pour aller plus loin : gérer auto-removal si un joueur quitte
  })
})

server.listen(3001, () => {
  console.log("Socket server running on http://localhost:3001")
})