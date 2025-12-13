import asyncio
import random
import time
import socketio

WS_URL = "https://opketme.uz/api"   # change to your backend
SOCKET_PATH = "/socket.io"

TOTAL_DRIVERS = 10
RIDE_ID = "TEST_RIDE_ID"

# You MUST generate valid JWTs or reuse a test token
JWT_TOKEN = "VALID_JWT_HERE"

results = {
    "accepted": 0,
    "rejected": 0,
    "errors": 0,
}


class DriverClient:
    def __init__(self, driver_id: int):
        self.driver_id = driver_id
        self.sio = socketio.AsyncClient(reconnection=False)
        self.accepted = False

        self.sio.on("ride_status", self.on_ride_status)
        self.sio.on("error", self.on_error)

    async def connect(self):
        await self.sio.connect(
            WS_URL,
            socketio_path=SOCKET_PATH,
            auth={
                "token": JWT_TOKEN,
                "fcmToken": f"test-fcm-{self.driver_id}",
            },
            transports=["websocket"],
        )

    async def go_online(self):
        await self.sio.emit("driver_online")

    async def accept_ride(self):
        await self.sio.emit("accept_ride", {"rideId": RIDE_ID})

    async def on_ride_status(self, data):
        if data.get("status") == "accepted":
            self.accepted = True
            results["accepted"] += 1
        await self.sio.disconnect()

    async def on_error(self, data):
        results["rejected"] += 1
        await self.sio.disconnect()

    async def run(self):
        try:
            await self.connect()
            await self.go_online()

            # Simulate FCM delay
            await asyncio.sleep(random.uniform(0.2, 1.0))

            await self.accept_ride()

            # Wait for response
            await asyncio.sleep(3)

        except Exception as e:
            results["errors"] += 1
        finally:
            if self.sio.connected:
                await self.sio.disconnect()


async def main():
    start = time.time()

    drivers = [DriverClient(i) for i in range(TOTAL_DRIVERS)]
    await asyncio.gather(*(d.run() for d in drivers))

    print("\n=== RESULTS ===")
    print(f"Drivers:   {TOTAL_DRIVERS}")
    print(f"Accepted:  {results['accepted']}")
    print(f"Rejected:  {results['rejected']}")
    print(f"Errors:    {results['errors']}")
    print(f"Time:      {time.time() - start:.2f}s")


if __name__ == "__main__":
    asyncio.run(main())
