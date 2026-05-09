var grpc = require('@grpc/grpc-js')
var protoLoader = require('@grpc/proto-loader')
var path = require('path')

var PROTO_PATH = path.join(__dirname, '../protos/reservation.proto')
var packageDefinition = protoLoader.loadSync(PROTO_PATH, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true })
var reservation_proto = grpc.loadPackageDefinition(packageDefinition).reservation
console.log("Starting ReservationService...")

// store reservations in memory
var reservations = {}
var counter = 1 // used to generate reservation IDs like R001, R002


// unary - create a new reservation
function CreateReservation(call, callback) {
  try {
    console.log("[ReservationService] CreateReservation:", JSON.stringify(call.request))
    var org_id = (call.request.org_id || "").toString().trim()
    var org_name = (call.request.org_name || "").toString().trim()
    var farmer_id = (call.request.farmer_id || "").toString().trim()
    var produce_name = (call.request.produce_name || "").toString().trim()
    var quantity = parseInt(call.request.quantity) || 0
    var unit = (call.request.unit || "").toString().trim()
    var pickup_date = (call.request.pickup_date || "").toString().trim()
    if (!org_id) return callback(null, { success: false, reservation_id: "", status: "failed", pickup_date: "", message: "Organisation ID is required" })
    if (!farmer_id) return callback(null, { success: false, reservation_id: "", status: "failed", pickup_date: "", message: "Farmer ID is required" })
    if (!produce_name) return callback(null, { success: false, reservation_id: "", status: "failed", pickup_date: "", message: "Produce name is required" })
    if (!quantity) return callback(null, { success: false, reservation_id: "", status: "failed", pickup_date: "", message: "Quantity must be greater than 0" })
    if (!unit) return callback(null, { success: false, reservation_id: "", status: "failed", pickup_date: "", message: "Unit is required" })
    if (!pickup_date) return callback(null, { success: false, reservation_id: "", status: "failed", pickup_date: "", message: "Pickup date is required" })

      // auto generate a reservation ID
    var reservation_id = "R" + String(counter).padStart(3, "0")
    counter++
    reservations[reservation_id] = { org_id, org_name, farmer_id, produce_name, quantity, unit, pickup_date, status: "confirmed" }
    console.log("[ReservationService] Created:", reservation_id)
    callback(null, { success: true, reservation_id, status: "confirmed", pickup_date, message: "Reservation confirmed" })
  } catch (e) {
    callback(null, { success: false, reservation_id: "", status: "failed", pickup_date: "", message: "Error: " + e.message })
  }
}

// unary - look up an existing reservation by ID
function GetReservation(call, callback) {
  try {
    console.log("[ReservationService] GetReservation:", JSON.stringify(call.request))
    var reservation_id = (call.request.reservation_id || "").toString().trim()
    var res = reservations[reservation_id]
    if (!res) return callback(null, { success: false, reservation_id, status: "not found", pickup_date: "", message: "Reservation not found" })
    callback(null, { success: true, reservation_id, status: res.status, pickup_date: res.pickup_date, message: "Reservation found" })
  } catch (e) {
    callback(null, { success: false, reservation_id: "", status: "error", pickup_date: "", message: "Error: " + e.message })
  }
}

// bidirectional streaming - live negotiation between org and system
function NegotiateReservation(call) {
  console.log("[ReservationService] Bidirectional stream opened")

  // listen for messages from the client
  call.on('data', function(message) {
    // respond based on what the client said
    var sender = (message.sender || "Client").toString()
    var text = (message.message || "").toString()
    var timestamp = new Date().toISOString()
    console.log("[ReservationService] Received from", sender + ":", text)
    var response
    var lower = text.toLowerCase()
    if (lower.includes("available")) {
      response = "Yes, produce is available for reservation."
    } else if (lower.includes("confirm") || lower.includes("ok")) {
      response = "Reservation confirmed! You will receive a confirmation ID shortly."
    } else if (lower.includes("cancel")) {
      response = "Reservation has been cancelled as requested."
    } else if (lower.includes("hello") || lower.includes("hi")) {
      response = "Hello! How can I assist with your reservation today?"
    } else {
      response = "Message received: '" + text + "'. How can I help you further?"
    }
    call.write({ sender: "HarvestBridge System", message: response, timestamp })
  })

  // when client closes the stream, close ours too
  call.on('end', function() {
    console.log("[ReservationService] Bidirectional stream closed")
    call.end()
  })
  call.on('error', function(e) {
    console.log("[ReservationService] Stream error:", e.message)
  })
}

var server = new grpc.Server()
server.addService(reservation_proto.ReservationService.service, { CreateReservation, GetReservation, NegotiateReservation })
server.bindAsync("0.0.0.0:4002", grpc.ServerCredentials.createInsecure(), function () {
  console.log("📦 ReservationService running on port 4002")
  server.start()
})
