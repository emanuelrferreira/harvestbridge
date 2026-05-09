var grpc = require('@grpc/grpc-js')
var protoLoader = require('@grpc/proto-loader')
var path = require('path')

var PROTO_PATH = path.join(__dirname, '../protos/impact.proto')
var packageDefinition = protoLoader.loadSync(PROTO_PATH, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true })
var impact_proto = grpc.loadPackageDefinition(packageDefinition).impact

// keep all distribution records in memory
var distributions = []

// unary - log a completed food distribution
function LogDistribution(call, callback) {
  try {
    console.log("[ImpactTrackerService] LogDistribution:", JSON.stringify(call.request))
    var org_id = (call.request.org_id || "").toString().trim()
    var farmer_id = (call.request.farmer_id || "").toString().trim()
    var produce_name = (call.request.produce_name || "").toString().trim()
    var quantity_kg = parseInt(call.request.quantity_kg) || 0
    var date = (call.request.date || "").toString().trim()
    if (!org_id || !farmer_id || !produce_name || !quantity_kg || !date) {
      return callback(null, { success: false, message: "All fields are required" })
    }
    distributions.push({ org_id, farmer_id, produce_name, quantity_kg, date })
    console.log("[ImpactTrackerService] Logged:", quantity_kg, "kg of", produce_name)
    callback(null, { success: true, message: "Distribution logged successfully" })
  } catch (e) {
    callback(null, { success: false, message: "Error: " + e.message })
  }
}

// unary - generate a summary report
function GetImpactReport(call, callback) {
  try {
    var period = (call.request.period || "All time").toString()
    var total_kg = 0
    var orgs = new Set() // set avoids counting same org twice
    distributions.forEach(function(d) { total_kg += d.quantity_kg; orgs.add(d.org_id) })
    // 82% estimate based on typical food recovery rates
    var waste_avoided_kg = Math.floor(total_kg * 0.82)
    console.log("[ImpactTrackerService] Report generated for:", period)
    callback(null, { success: true, period, total_kg, orgs_served: orgs.size, waste_avoided_kg, message: "Report generated successfully" })
  } catch (e) {
    callback(null, { success: false, period: "", total_kg: 0, orgs_served: 0, waste_avoided_kg: 0, message: "Error: " + e.message })
  }
}

// server-side streaming - stream each distribution event one by one
function StreamDistributions(call) {
  console.log("[ImpactTrackerService] Server-side streaming started")
  var period = (call.request.period || "").toString()
  var running_total = 0
  if (distributions.length === 0) {
    call.write({ org_id: "SYSTEM", farmer_id: "-", produce_name: "No distributions logged yet", quantity_kg: 0, date: new Date().toISOString().split("T")[0], running_total: 0 })
    call.end()
    return
  }
  var index = 0

  // send events with a small delay to simulate real-time feed
  var interval = setInterval(function() {
    if (index >= distributions.length) {
      clearInterval(interval)
      call.end()
      return
    }
    var d = distributions[index]
    running_total += d.quantity_kg
    console.log("[ImpactTrackerService] Streaming event", index + 1, "of", distributions.length)
    call.write({ org_id: d.org_id, farmer_id: d.farmer_id, produce_name: d.produce_name, quantity_kg: d.quantity_kg, date: d.date, running_total })
    index++
  }, 500)

  // if client cancels, stop the interval
  call.on('cancelled', function() { clearInterval(interval) })
}

var server = new grpc.Server()
server.addService(impact_proto.ImpactTrackerService.service, { LogDistribution, GetImpactReport, StreamDistributions })
server.bindAsync("0.0.0.0:4003", grpc.ServerCredentials.createInsecure(), function () {
  console.log("📊 ImpactTrackerService running on port 4003")
  server.start()
})
