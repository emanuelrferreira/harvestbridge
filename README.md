# 🌾 HarvestBridge
Smart food distribution system — SDG 12: Responsible Consumption and Production

## How to Run
Open 4 terminals:

```bash
# Terminal 1 - Farmer Service (port 4001)
cd farmer-service && npm install && npm start

# Terminal 2 - Reservation Service (port 4002)
cd reservation-service && npm install && npm start

# Terminal 3 - Impact Service (port 4003)
cd impact-service && npm install && npm start

# Terminal 4 - Client Dashboard (port 3000)
cd client && npm install && npm start
```

Open browser at: http://localhost:3000

## gRPC Types Implemented
- Unary RPC — Register Farmer, Add Produce, Create Reservation, Log Distribution, Get Report
- Client-Side Streaming — Batch Add Produce (FarmerService)
- Server-Side Streaming — Live Distribution Stream (ImpactTrackerService)
- Bidirectional Streaming — Live Negotiation Chat (ReservationService)
