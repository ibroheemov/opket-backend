import asyncio
import random
import time
import requests
import socketio
import config  # assume config has BASE_URL, WS_URL, SOCKET_PATH, TOTAL_RIDES, DRIVERS_PER_RIDE, FCM_PREFIX

metrics = {}

# === STEP 0: CREATE REAL DRIVERS ===
def create_real_drivers(total_drivers):
    driver_credentials = []
    for i in range(total_drivers):
        # text fields must be tuples: (None, value)
        fields = {
            "firstname": (None, f"Test{i}"),
            "lastname": (None, "Driver"),
            "phone": (None, f"+99890123{i:03d}"),
            "carNumber": (None, f"AA{i:03d}BB"),
            "carModel": (None, "TestCar"),
            "carColor": (None, "Black"),
            "regionCode": (None, "01"),
        }

        # No files uploaded yet, only text fields
        resp = requests.post(f"{config.BASE_URL}/driver/register", files=fields)
        if resp.status_code != 200:
            print(f"Failed to create driver {i}: {resp.text}")
            continue

        data = resp.json()
        driver_id = data["driver"]["_id"]
        jwt_token = data["accessToken"]
        driver_credentials.append((driver_id, jwt_token))
        print(f"Created driver: {driver_id}")
    return driver_credentials

# === STEP 1: CREATE RIDES VIA API ===
def create_rides(total_rides):
    ride_ids = []
    for _ in range(total_rides):
        payload = {
            "chatId": 7175509887,
            "location": {"lat": 41.3 + random.random() * 0.01, "lon": 69.2 + random.random() * 0.01},
        }
        headers = {"Authorization": f"Bearer {config.JWT_TOKEN}"}
        resp = requests.post(f"{config.BASE_URL}/user/request-ride", json=payload, headers=headers)
        resp.raise_for_status()
        ride_data = resp.json()
        ride_id = ride_data["rideId"]
        ride_ids.append(ride_id)
        metrics[ride_id] = {"accepted": 0, "rejected": 0, "errors": 0}
        print(f"Created ride: {ride_id}")
    return ride_ids

# === DRIVER CLIENT WITH RIDE OFFER LISTENING ===
class DriverClient:
    def __init__(self, driver_id: str, jwt_token: str):
        self.driver_id = driver_id
        self.jwt_token = jwt_token
        self.sio = socketio.AsyncClient(reconnection=True)  # allow reconnection
        self.ride_handled = asyncio.Event()  # set when ride is accepted/rejected
        self.current_ride_id = None

        # Event handlers
        self.sio.on("ride_offered", self.on_ride_offered)
        self.sio.on("ride_status", self.on_ride_status)
        self.sio.on("error", self.on_error)
        self.sio.on("connect", self.on_connect)
        self.sio.on("disconnect", self.on_disconnect)
        self.sio.on("connect_error", self.on_connect_error)

    async def connect(self):
        print(f"[{self.driver_id}] Connecting to {config.WS_URL}...")
        await self.sio.connect(
            config.WS_URL,
            socketio_path=config.SOCKET_PATH,
            auth={
                "token": self.jwt_token,
                "fcmToken": config.FCM_PREFIX,
            },
            transports=["websocket"],
        )

    async def go_online(self):
        print(f"[{self.driver_id}] Going online...")
        await self.sio.emit("driver_online")
        # Give backend time to register driver online
        await asyncio.sleep(random.uniform(0.5, 1.5))

    async def accept_ride(self, ride_id):
        self.current_ride_id = ride_id
        print(f"[{self.driver_id}] Accepting ride {ride_id}...")
        await self.sio.emit("accept_ride", {"rideId": ride_id})

    # --- SocketIO Event Handlers ---
    async def on_connect(self):
        print(f"[{self.driver_id}] Connected successfully.")

    async def on_disconnect(self):
        print(f"[{self.driver_id}] Disconnected.")

    async def on_connect_error(self, data):
        print(f"[{self.driver_id}] Connection failed:", data)
        self.ride_handled.set()

    async def on_ride_offered(self, data):
        # Backend offers a ride to this driver
        if data.get("driverId") != self.driver_id:
            return
        ride_id = data.get("rideId")
        if not ride_id:
            return
        print(f"[{self.driver_id}] Ride offered: {ride_id}")
        await self.accept_ride(ride_id)

    async def on_ride_status(self, data):
        ride_id = data.get("rideId")
        if ride_id != self.current_ride_id:
            return

        status = data.get("status")
        if status == "accepted":
            print(f"[{self.driver_id}] Ride accepted!")
            metrics[ride_id]["accepted"] += 1
        else:
            print(f"[{self.driver_id}] Ride rejected: {data}")
            metrics[ride_id]["rejected"] += 1
        self.ride_handled.set()

    async def on_error(self, data):
        ride_id = self.current_ride_id
        if ride_id:
            metrics[ride_id]["rejected"] += 1
        print(f"[{self.driver_id}] Ride error: {data}")
        self.ride_handled.set()

    async def safe_disconnect(self):
        if self.sio.connected:
            try:
                await self.sio.disconnect()
            except Exception:
                pass

    async def run(self):
        try:
            await self.connect()
            await self.go_online()
            await self.send_location()
            # Wait indefinitely until a ride is offered and handled
            await self.ride_handled.wait()
        except Exception as e:
            print(f"[{self.driver_id}] Exception: {e}")
            if self.current_ride_id:
                metrics[self.current_ride_id]["errors"] += 1
        finally:
            await self.safe_disconnect()
    
    async def send_location(self):
        # Generate a new random location around a base point
        lat = 41.3 + random.random() * 0.01
        lon = 69.2 + random.random() * 0.01
        print(f"[{self.driver_id}] Sending location: lat={lat}, lon={lon}")
        await self.sio.emit("driver_location", {"lat": lat, "lon": lon})
        await asyncio.sleep(random.uniform(0.1, 0.3))

# === RUN LOAD TEST ===
async def main():
    # 1. Create drivers
    total_drivers_needed = config.TOTAL_RIDES * config.DRIVERS_PER_RIDE
    drivers = create_real_drivers(total_drivers_needed)

    # 2. Create rides
    ride_ids = create_rides(config.TOTAL_RIDES)

    # 3. Launch all drivers
    driver_clients = []
    driver_tasks = []

    driver_index = 0
    for ride_id in ride_ids:
        for _ in range(config.DRIVERS_PER_RIDE):
            if driver_index >= len(drivers):
                break
            driver_id, jwt_token = drivers[driver_index]
            driver_index += 1

            # Each driver is a client that waits for ride offers
            client = DriverClient(driver_id, jwt_token)
            driver_clients.append(client)
            driver_tasks.append(client.run())

    # 4. Run all driver clients concurrently
    print(f"Starting {len(driver_tasks)} driver clients...")
    await asyncio.gather(*driver_tasks)

    # 5. Print metrics
    print("\n=== LOAD TEST RESULTS ===")
    for ride_id, stat in metrics.items():
        print(f"Ride {ride_id}: Accepted={stat['accepted']}, Rejected={stat['rejected']}, Errors={stat['errors']}")

if __name__ == "__main__":
    asyncio.run(main())

