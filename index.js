require("dotenv").config()
const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const cors = require("cors")

const app = express()

app.use(cors({
  origin: process.env.FRONT_URL,
  methods: ["GET", "POST"]
}))

const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: process.env.FRONT_URL,
    methods: ["GET", "POST"]
  }
})

// Stockage simple en mémoire
const rooms = {}

app.use("/", (req, res)=>{
    res.send("hello world")
})
function updateScore(room, playersIds, points) {
    playersIds.forEach((id) => {
      const player = room.players.find(p => p.playerId === id)
      if (player) {
        player.score += points
      }
    })
}

function findPseudoByPlayerId(room, playerId){
    return room.players.find(player=> player.playerId === playerId)?.pseudo
}

function nextTurn(room) {
    const currentIndex = room.players.findIndex(p => p.playerId === room.currentTurnPlayerId)
    const nextIndex = (currentIndex + 1) % room.players.length
  
    room.currentTurnPlayerId = room.players[nextIndex].playerId
    
    room.turnNumber += 1

    room.secretWord=""
    room.secretClue=0
    room.clueGived=[{}]
}

const normalizeWord = (word) => {
    return word
      .toLowerCase() // casse
      .normalize("NFD") // sépare les accents
      .replace(/[\u0300-\u036f]/g, "") // supprime les accents
      .replace(/\s+/g, "") // supprime les espaces
}

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
    io.to(roomId).emit("room-update", room)
    io.to(roomId).emit("game-started")
  })

  socket.on("secret-word-update", ({roomId, playerId, secretWord, secretClue}) => {
    const room = rooms[roomId]
    if (!room) return
    // vérification : seul le joueur courant peut modifier le mot secret
    if (room.currentTurnPlayerId !== playerId) return

    room.secretWord=secretWord
    room.secretClue=secretClue
    room.cluesGived=[{}]
    io.to(roomId).emit("room-update", room)
  })

  socket.on("giving-clue", ({roomId, playerId, clueGived}) => {
    const room = rooms[roomId]
    if (!room) return
    if (room.currentTurnPlayerId !== playerId) return

    room.cluesGived[room.cluesGived.length - 1] = {clue: clueGived}
    io.to(roomId).emit("room-update", room)
  })

  socket.on("guessing-word", ({roomId, playerId, guess}) => {
    const room = rooms[roomId]
    if (!room) return
    // if (room.currentTurnPlayerId === playerId) return

    room.cluesGived[room.cluesGived.length - 1][playerId] = guess

    const normalizedGuess = normalizeWord(guess)
    const normalizedSecret = normalizeWord(room.secretWord)

    if(normalizedGuess === normalizedSecret){
        const playersId = [playerId]
        if(room.cluesGived.length === room.secretClue){
            playersId.push(room.currentTurnPlayerId)
        }
        updateScore(room,playersId,room.cluesGived.length)
        
        const winnersPseudo = playersId.map(pId=> findPseudoByPlayerId(room, pId))

        io.to(roomId).emit("round-finish", {
            winners: winnersPseudo,
            points: room.cluesGived.length,
            guesser: findPseudoByPlayerId(room,playerId),
            secretWord: room.secretWord,
            secretClues: room.secretClue
        })
        nextTurn(room)
    }
    else {
        //verifier si tout le monde a écrit
        if(Object.keys(room.cluesGived[room.cluesGived.length - 1]).length === room.players.length){
            //cas où fin de manche 
            if(room.secretClue === room.cluesGived.length){
                room.cluesGived=[{}]
                io.to(roomId).emit("round-finish", {secretWord: room.secretWord})
                nextTurn(room)
            }
            else {
                //cas pas fin de manche 
                room.cluesGived.push({})
            }
        }
    }

    io.to(roomId).emit("room-update", room)

  })

  // Passer au joueur suivant
//     socket.on("next-turn", ({ roomId }) => {
//         console.log("JOUEUR SUIVANT")
//     const room = rooms[roomId]
//     if (!room) return
  
//     // calcul du joueur suivant
//     const currentIndex = room.players.findIndex(p => p.playerId === room.currentTurnPlayerId)
//     const nextIndex = (currentIndex + 1) % room.players.length
  
//     console.log("joueur précédent : ", room.currentTurnPlayerId)
//     room.currentTurnPlayerId = room.players[nextIndex].playerId
    
//     console.log("joueur actuel : ", room.currentTurnPlayerId)
//     room.turnNumber += 1

//     room.secretWord=""
//     room.secretClue=0
//     room.clueGived=[]
  
//     io.to(roomId).emit("room-update", room ) // update en live
//   })

  // Kick un joueur (seul admin)
  socket.on("kick-player", ({ roomId, playerId, targetPlayerId }) => {
    const room = rooms[roomId]
    if (!room) return

    const isSelfAction = playerId === targetPlayerId
    const isAdmin = room.hostPlayerId === playerId

    if (!isSelfAction && !isAdmin) {
        return
    }

    // prévenir le joueur kické
    const target = room.players.find(p => p.playerId === targetPlayerId)
    if (target) {
      io.to(target.socketId).emit("kicked")
    }

    room.players = room.players.filter(p => p.playerId !== targetPlayerId)

    io.to(roomId).emit("room-update", room)
  })

//   socket.on("update-score", ({ roomId, playersId, points }) => {
//     console.log("essai score")
//     const room = rooms[roomId]
//     if (!room) return
  
//     console.log("en train d'update score")
//     // const player = room.players.find(p => p.playerId === playerId)
//     // if (!player) return

  
//     // player.score += points


//     room.players.map((player) => {
//         const match = playersId.find(pId=> pId == player.playerId)
//         if(match){
//             player.score += points
//         }
//         return player
//     })

//     console.log("SCORE")
//     console.log(room)
  
//     // envoyer la room complète avec scores
//     io.to(roomId).emit("room-update", { ...room })
//   })
  

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

const PORT = process.env.PORT || 3001

server.listen(PORT, () => {
    console.log("Server running on port", PORT)
})