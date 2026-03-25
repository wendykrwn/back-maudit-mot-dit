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
      players: [{ playerId, socketId: socket.id, pseudo, score: 0 }],
      status: "waiting"
    }

    socket.join(roomId)
    io.to(roomId).emit("room-update", rooms[roomId])
    cb(roomId)
  })

    // Get room 
    socket.on("get-room",({roomId}, cb)=>{
        const room = rooms[roomId]

        if (!room) return cb({ error: "Room not found" })
        socket.join(roomId)
        io.to(roomId).emit("room-update", room)
        cb({ success: true })
    
    })

  // Rejoindre une room
  socket.on("join-room", ({ roomId, pseudo, playerId }, cb) => {
    const room = rooms[roomId]
    if (!room) return cb({ error: "Room not found" })

    const existing = room.players.find(p => p.playerId === playerId)
    if (existing) {
      existing.socketId = socket.id // reconnexion
    } else {
      room.players.push({ playerId, socketId: socket.id, pseudo, score: 0 })
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
    room.currentTurnPlayerId = room.players[Math.floor(Math.random() * room.players.length)].playerId
    room.turnNumber = 1
    console.log(room)
    io.to(roomId).emit("room-update", room)
    io.to(roomId).emit("game-started")
  })

  // Passer au joueur suivant
    socket.on("next-turn", ({ roomId, playerId }) => {
    const room = rooms[roomId]
    if (!room) return
  
    // vérification : seul le joueur courant peut passer son tour
    if (room.currentTurnPlayerId !== playerId) return
  
    // calcul du joueur suivant
    const currentIndex = room.players.findIndex(p => p.playerId === playerId)
    const nextIndex = (currentIndex + 1) % room.players.length
  
    room.currentTurnPlayerId = room.players[nextIndex].playerId
    room.turnNumber += 1
  
    io.to(roomId).emit("room-update", { ...room }) // update en live
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

  socket.on("update-score", ({ roomId, playerId, points }) => {
    const room = rooms[roomId]
    if (!room) return
  
    const player = room.players.find(p => p.playerId === playerId)
    if (!player) return
  
    player.score += points
  
    // envoyer la room complète avec scores
    io.to(roomId).emit("room-update", { ...room })
  })
  

  // Déconnexion
  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id)
    // Pour aller plus loin : gérer auto-removal si un joueur quitte
  })
})

app.get("/room/:id", (req, res) => {
    const room = rooms[req.params.id]
    if (!room) return res.status(404).json({ error: "Room not found" })
    res.json(room)
  })

server.listen(3001, () => {
  console.log("Socket server running on http://localhost:3001")
})