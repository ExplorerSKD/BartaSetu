"""
Direct verification script for BartaSetu Backend (Phase 1).
Can be run simply as: python verify_backend.py
Runs full end-to-end integration verification against local MySQL database.
"""

import os
os.environ["PYTHONIOENCODING"] = "utf-8"

import asyncio
import sys
import uuid
from datetime import datetime, timezone, timedelta

# Ensure UTF-8 output on Windows console
if sys.platform == "win32":
    try:
        if sys.stdout.encoding != "utf-8":
            sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Import models first to register them
import app.models
from app.database import engine, Base
from app.main import app as fastapi_app
from httpx import AsyncClient, ASGITransport

async def run_verification():
    print("=" * 60)
    print("      BARTASETU BACKEND PHASE 1 VERIFICATION TEST")
    print("      'BartaSetu - Offline & Online Mesh Backend'")
    print("=" * 60)

    # 1. Initialize DB tables
    print("\n[STEP 1] Testing Database Connection & Table Initialization...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("  -> MySQL database connected & tables verified successfully!")
    except Exception as e:
        print(f"  -> [FAIL] Database connection failed: {e}")
        sys.exit(1)

    async with AsyncClient(transport=ASGITransport(app=fastapi_app), base_url="http://test") as client:
        # 2. Test Root and Health
        print("\n[STEP 2] Testing Health and Root Endpoints...")
        r = await client.get("/")
        assert r.status_code == 200, f"Root returned {r.status_code}"
        root_data = r.json()
        print(f"  -> GET / : {root_data['app']} - Status: {root_data['status']}")

        r = await client.get("/health")
        assert r.status_code == 200
        print(f"  -> GET /health : {r.json()['status']}")

        # 3. Test User Registration
        print("\n[STEP 3] Testing User Registration...")
        suffix = uuid.uuid4().hex[:6]
        user_payload = {
            "username": f"mesh_pilot_{suffix}",
            "email": f"pilot_{suffix}@bartasetu.org",
            "password": "PilotPassword123#",
            "display_name": f"Pilot {suffix.upper()}"
        }
        r = await client.post("/api/auth/register", json=user_payload)
        assert r.status_code == 201, f"Register failed: {r.text}"
        tokens = r.json()
        assert "access_token" in tokens
        assert "refresh_token" in tokens
        access_token = tokens["access_token"]
        refresh_token = tokens["refresh_token"]
        auth_headers = {"Authorization": f"Bearer {access_token}"}
        print(f"  -> User '{user_payload['username']}' registered! JWT Access Token generated.")

        # 4. Test User Login
        print("\n[STEP 4] Testing User Login...")
        r = await client.post("/api/auth/login", json={
            "username": user_payload["username"],
            "password": user_payload["password"]
        })
        assert r.status_code == 200
        print("  -> User login verified with bcrypt password validation.")

        # 5. Test Token Refresh
        print("\n[STEP 5] Testing Token Refresh...")
        r = await client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
        assert r.status_code == 200
        print("  -> Token refresh verified.")

        # 6. Test Device Registration
        print("\n[STEP 6] Testing BLE Device Registration...")
        dev_payload = {
            "device_name": "Samsung Galaxy S23 (Relay Node)",
            "fcm_token": "fcm_test_token_abcdef123456",
            "platform": "android",
            "latitude": 22.5726,
            "longitude": 88.3639
        }
        r = await client.post("/api/devices/register", json=dev_payload, headers=auth_headers)
        assert r.status_code == 201
        device = r.json()
        device_id = device["id"]
        user_id = device["user_id"]
        print(f"  -> Device registered: {device['device_name']} (ID: {device_id})")

        # 7. Test Message Creation (Store & Forward Ingestion)
        print("\n[STEP 7] Testing Message Ingestion (Store & Forward / Gateway Upload)...")
        msg_id = f"MSG-{uuid.uuid4().hex[:8].upper()}"
        now = datetime.now(timezone.utc)
        expires = now + timedelta(days=1)
        msg_payload = {
            "id": msg_id,
            "recipient_id": user_id,
            "encrypted_content": "gAAAAABl...[X25519-AES-256-GCM-CIPHERTEXT]...",
            "encrypted_key": "k8X129...[SYMMETRIC-KEY]...",
            "iv": "iv_sample_nonce_96bit",
            "content_type": "text",
            "priority": "normal",
            "hop_count": 2,
            "max_hops": 10,
            "ttl": 86400,
            "expires_at": expires.isoformat(),
            "created_at": now.isoformat(),
            "gateway_device_id": device_id,
            "route": [
                {"device_id": "DEV-HOP-1", "hop_number": 1, "action": "RELAY"},
                {"device_id": "DEV-HOP-2", "hop_number": 2, "action": "RELAY"}
            ]
        }
        r = await client.post("/api/messages", json=msg_payload, headers=auth_headers)
        assert r.status_code == 201, f"Message creation failed: {r.text}"
        created_msg = r.json()
        assert created_msg["id"] == msg_id
        print(f"  -> Message stored: {msg_id} (Hop Count: {created_msg['hop_count']}, Status: {created_msg['status']})")

        # 8. Test Message Fetch
        print("\n[STEP 8] Testing Message Retrieval...")
        r = await client.get("/api/messages", headers=auth_headers)
        assert r.status_code == 200
        messages = r.json()
        assert any(m["id"] == msg_id for m in messages)
        print(f"  -> Retrieved {len(messages)} messages for user.")

        # 9. Test Message Acknowledgment (ACK)
        print("\n[STEP 9] Testing Delivery Acknowledgment...")
        r = await client.post(f"/api/messages/{msg_id}/ack", json={
            "message_id": msg_id,
            "status": "DELIVERED"
        }, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "DELIVERED"
        print(f"  -> Delivery ACK recorded for {msg_id} (Status: DELIVERED)")

        # 10. Test SOS Emergency Alert Creation & Priority Handling
        print("\n[STEP 10] Testing SOS Emergency Alert System...")
        sos_payload = {
            "device_id": device_id,
            "message": "EMERGENCY! Battery 15%, trapped in flash flood, need evacuation!",
            "latitude": 22.5750,
            "longitude": 88.3690,
            "battery_level": 15
        }
        r = await client.post("/api/sos", json=sos_payload, headers=auth_headers)
        assert r.status_code == 201
        sos_alert = r.json()
        assert sos_alert["status"] == "ACTIVE"
        assert sos_alert["battery_level"] == 15
        print(f"  -> Critical SOS alert logged: ID={sos_alert['id']} at ({sos_alert['latitude']}, {sos_alert['longitude']})")

        # 11. Test SOS Alerts Listing
        r = await client.get("/api/sos", headers=auth_headers)
        assert r.status_code == 200
        alerts = r.json()
        assert len(alerts) >= 1
        print(f"  -> Listed {len(alerts)} active SOS alerts.")

    print("\n" + "=" * 60)
    print("  ALL 11 BACKEND VERIFICATION CHECKS PASSED SUCCESSFULLY! ")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(run_verification())
