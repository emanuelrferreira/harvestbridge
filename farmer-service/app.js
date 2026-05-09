var grpc = require('@grpc/grpc-js')
var protoLoader = require('@grpc/proto-loader')
var path = require('path')

// load the proto file for the farmer service
var PROTO_PATH = path.join(__dirname, '../protos/farmer.proto')

// keepCase makes sure field names like farmer_id stay as is
var packageDefinition = protoLoader.loadSync(PROTO_PATH, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true })
var farmer_proto = grpc.loadPackageDefinition(packageDefinition).farmer
console.log("Starting Farmer Service...")

// store farmers and their produce in memory
var farmers = {}
var produce = {}

// unary - register a new farmer
function RegisterFarmer(call, callback) {
  try {
    // log incoming request for debugging
    console.log("[FarmerService] RegisterFarmer:", JSON.stringify(call.request))

    // make sure all fields are filled in
    var id = (call.request.farmer_id || "").toString().trim()
    var name = (call.request.name || "").toString().trim()
    var location = (call.request.location || "").toString().trim()
    if (!id) return callback(null, { success: false, message: "Farmer ID is required", farmer_id: "" })
    if (!name) return callback(null, { success: false, message: "Name is required", farmer_id: "" })
    if (!location) return callback(null, { success: false, message: "Location is required", farmer_id: "" })
      // verification - dont allow duplicate farmer IDs
    if (farmers[id]) return callback(null, { success: false, message: "Farmer ID already exists", farmer_id: id })
    farmers[id] = { name, location }
    produce[id] = []
    callback(null, { success: true, message: "Farmer registered successfully", farmer_id: id })
  } catch (e) {
    callback(null, { success: false, message: "Error: " + e.message, farmer_id: "" })
  }
}

// unary - add a single produce item
function AddProduce(call, callback) {
  try {
    console.log("[FarmerService] AddProduce:", JSON.stringify(call.request))
    var farmer_id = (call.request.farmer_id || "").toString().trim()
    var produce_name = (call.request.produce_name || "").toString().trim()
    var quantity = parseInt(call.request.quantity) || 0
    var unit = (call.request.unit || "").toString().trim()
    var available_date = (call.request.available_date || "").toString().trim()
    if (!farmers[farmer_id]) return callback(null, { success: false, message: "Farmer not found. Register first.", items_added: 0 })
    if (!produce_name || !quantity || !unit || !available_date) return callback(null, { success: false, message: "All produce fields are required", items_added: 0 })
    produce[farmer_id].push({ produce_name, quantity, unit, available_date })
    callback(null, { success: true, message: "Produce added successfully", items_added: 1 })
  } catch (e) {
    callback(null, { success: false, message: "Error: " + e.message, items_added: 0 })
  }
}

// unary - return all produce for a given farmer
function ListProduce(call, callback) {
  try {
    var farmer_id = (call.request.farmer_id || "").toString().trim()
    if (!farmers[farmer_id]) return callback(null, { success: false, farmer_name: "", items: [] })
    callback(null, { success: true, farmer_name: farmers[farmer_id].name, items: produce[farmer_id] || [] })
  } catch (e) {
    callback(null, { success: false, farmer_name: "", items: [] })
  }
}

// client-side streaming - receive multiple produce items at once
function AddMultipleProduce(call, callback) {
  var items_added = 0
  var errors = []

  // each time a new item arrives from the stream
  call.on('data', function(request) {
    try {
      var farmer_id = (request.farmer_id || "").toString().trim()
      var produce_name = (request.produce_name || "").toString().trim()
      var quantity = parseInt(request.quantity) || 0
      var unit = (request.unit || "").toString().trim()
      var available_date = (request.available_date || "").toString().trim()
      if (!farmers[farmer_id]) { errors.push("Farmer not found: " + farmer_id); return }
      if (produce_name && quantity && unit && available_date) {
        produce[farmer_id].push({ produce_name, quantity, unit, available_date })
        items_added++
        console.log("[FarmerService] Streamed item:", produce_name)
      }
    } catch (e) { errors.push(e.message) }
  })

  // when client finishes sending, respond with total
  call.on('end', function() {
    if (errors.length > 0) {
      callback(null, { success: false, message: "Errors: " + errors.join(", "), items_added })
    } else {
      callback(null, { success: true, message: items_added + " items added via streaming", items_added })
    }
  })

  // handle stream errors
  call.on('error', function(e) { console.log("[FarmerService] Stream error:", e.message) })
}

var server = new grpc.Server()
server.addService(farmer_proto.FarmerService.service, { RegisterFarmer, AddProduce, ListProduce, AddMultipleProduce })
server.bindAsync("0.0.0.0:4001", grpc.ServerCredentials.createInsecure(), function () {
  console.log("🌾 FarmerService running on port 4001")
  server.start()
})
