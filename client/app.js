var express = require('express')
var grpc = require('@grpc/grpc-js')
var protoLoader = require('@grpc/proto-loader')
var path = require('path')

var app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

var opts = { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true }
var farmerProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, '../protos/farmer.proto'), opts)).farmer
var reservationProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, '../protos/reservation.proto'), opts)).reservation
var impactProto = grpc.loadPackageDefinition(protoLoader.loadSync(path.join(__dirname, '../protos/impact.proto'), opts)).impact

var farmerClient = new farmerProto.FarmerService("0.0.0.0:4001", grpc.credentials.createInsecure())
var reservationClient = new reservationProto.ReservationService("0.0.0.0:4002", grpc.credentials.createInsecure())
var impactClient = new impactProto.ImpactTrackerService("0.0.0.0:4003", grpc.credentials.createInsecure())

// FARMER - Unary
app.post('/api/farmer/register', function(req, res) {
  farmerClient.RegisterFarmer(req.body, function(err, response) {
    if (err) return res.json({ success: false, message: "Could not connect to FarmerService: " + err.message })
    res.json(response)
  })
})

app.post('/api/farmer/produce/add', function(req, res) {
  farmerClient.AddProduce(req.body, function(err, response) {
    if (err) return res.json({ success: false, message: "Could not connect to FarmerService: " + err.message })
    res.json(response)
  })
})

app.post('/api/farmer/produce/list', function(req, res) {
  farmerClient.ListProduce(req.body, function(err, response) {
    if (err) return res.json({ success: false, message: "Could not connect to FarmerService: " + err.message })
    res.json(response)
  })
})

// FARMER - Client-side streaming
app.post('/api/farmer/produce/batch', function(req, res) {
  var items = req.body.items || []
  if (items.length === 0) return res.json({ success: false, message: "No items provided" })
  var call = farmerClient.AddMultipleProduce(function(err, response) {
    if (err) return res.json({ success: false, message: "Streaming error: " + err.message })
    res.json(response)
  })
  items.forEach(function(item) { call.write(item) })
  call.end()
})

// RESERVATION - Unary
app.post('/api/reservation/create', function(req, res) {
  reservationClient.CreateReservation(req.body, function(err, response) {
    if (err) return res.json({ success: false, message: "Could not connect to ReservationService: " + err.message })
    res.json(response)
  })
})

app.post('/api/reservation/get', function(req, res) {
  reservationClient.GetReservation(req.body, function(err, response) {
    if (err) return res.json({ success: false, message: "Could not connect to ReservationService: " + err.message })
    res.json(response)
  })
})

// RESERVATION - Bidirectional streaming via SSE
app.get('/api/reservation/negotiate/stream', function(req, res) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  var call = reservationClient.NegotiateReservation()
  call.on('data', function(message) {
    res.write('data: ' + JSON.stringify(message) + '\n\n')
  })
  call.on('end', function() { res.end() })
  call.on('error', function(e) { res.write('data: ' + JSON.stringify({ sender: 'System', message: 'Stream error: ' + e.message, timestamp: new Date().toISOString() }) + '\n\n') })
  req.on('close', function() { call.end() })
  req.negotiationCall = call
})

app.post('/api/reservation/negotiate/send', function(req, res) {
  res.json({ success: true, message: "Use the negotiate stream endpoint" })
})

// IMPACT - Unary
app.post('/api/impact/log', function(req, res) {
  impactClient.LogDistribution(req.body, function(err, response) {
    if (err) return res.json({ success: false, message: "Could not connect to ImpactTrackerService: " + err.message })
    res.json(response)
  })
})

app.post('/api/impact/report', function(req, res) {
  impactClient.GetImpactReport(req.body, function(err, response) {
    if (err) return res.json({ success: false, message: "Could not connect to ImpactTrackerService: " + err.message })
    res.json(response)
  })
})

// IMPACT - Server-side streaming via SSE
app.get('/api/impact/stream', function(req, res) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  var period = req.query.period || "All time"
  var call = impactClient.StreamDistributions({ period })
  call.on('data', function(event) {
    res.write('data: ' + JSON.stringify(event) + '\n\n')
  })
  call.on('end', function() {
    res.write('data: __END__\n\n')
    res.end()
  })
  call.on('error', function(e) {
    res.write('data: ' + JSON.stringify({ error: e.message }) + '\n\n')
    res.end()
  })
  req.on('close', function() { call.cancel() })
})

app.listen(3000, function() {
  console.log("🌐 HarvestBridge Dashboard running at http://localhost:3000")
})
