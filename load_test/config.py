# === Backend URLs ===
# BASE_URL = "https://opketme.uz/api"
# WS_URL = "https://opketme.uz"        
BASE_URL = "http://localhost:3000"
WS_URL = "http://localhost:3000"        
SOCKET_PATH = "/socket.io"

# === Load test settings ===
TOTAL_RIDES = 12
DRIVERS_PER_RIDE = 17
FCM_PREFIX = "eoWZVPLmQdildy5Tp4mgaL:APA91bFRuFGQQebpqJ9Iej7czR-kZvhtV41PsDl1P79pqyd5-9fdUsdG0VAFHg6SqzIKub8Ql64dhui4Fdhu081gC33bd3xOCKh0jbT3F0IMyFJZlyHqNjY"

# === Driver auth ===
JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5M2FiYjhlNDAyODE1MDAzZWE4MTA3ZCIsImlhdCI6MTc2NTYwMjAzNCwiZXhwIjoxNzY2MjA2ODM0fQ.iQDFLL6OqRI_KYPqlTkCRxSPa-Y42WeG73QmCNHb4_Q"   # replace with real JWT
USE_FAKE_JWT = False

# === Ride defaults ===
DEFAULT_PICKUP = {"lat": 41.3, "lon": 69.2}
DEFAULT_DROPOFF = {"lat": 41.4, "lon": 69.3}
