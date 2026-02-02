// src/modules/ride/ride.lua.ts

export const ACCEPT_RIDE_LUA = `
-- =========================
-- KEYS
-- 1 = ride:{rideId}
-- 2 = ride_accept:{rideId}
-- 3 = ride_reservation:{rideId}:{driverId}
-- =========================
-- ARGV
-- 1 = driverId
-- 2 = now (ms)
-- =========================

-- Ride missing
if redis.call("EXISTS", KEYS[1]) == 0 then
  return {0, "RIDE_NOT_FOUND"}
end

-- Already accepted
if redis.call("EXISTS", KEYS[2]) == 1 then
  return {0, redis.call("GET", KEYS[2])}
end

-- Reservation invalid
if redis.call("EXISTS", KEYS[3]) == 0 then
  return {0, "NOT_RESERVED_FOR_YOU"}
end

-- Ride cancelled or expired
local phase = redis.call("HGET", KEYS[1], "phase")
if phase == "cancelled" or phase == "expired" then
  return {0, "RIDE_NOT_ACTIVE"}
end

local expiresAt = redis.call("HGET", KEYS[1], "expiresAt")
if expiresAt and tonumber(expiresAt) < tonumber(ARGV[2]) then
  return {0, "RIDE_EXPIRED"}
end

-- Accept ride
redis.call("SET", KEYS[2], ARGV[1], "PX", 600000)

redis.call("HSET", KEYS[1],
  "status", "accepted",
  "driverId", ARGV[1],
  "acceptedAt", ARGV[2]
)

return {1, ARGV[1]}
`;

export const RESERVE_RIDE_LUA = `
-- version: 2
-- =========================
-- KEYS
-- 1 = ride_reservation:{rideId}:{driverId}
-- 2 = driver_offer:{driverId}
-- =========================
-- ARGV
-- 1 = driverId
-- 2 = rideId
-- 3 = ttlMs
-- =========================

-- Driver busy
if redis.call("EXISTS", KEYS[2]) == 1 then
  return 0
end

-- Reserve the ride for this driver
redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[3])

-- Set driver_offer key
redis.call("SET", KEYS[2], ARGV[2], "PX", ARGV[3])

return 1
`