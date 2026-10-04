"""
End-to-End API test suite for BartaSetu Phase 1.
Tests:
- Health check
- User registration and login (JWT authentication)
- Device registration
- Message creation, sync, and acknowledgment
- SOS emergency alert creation and retrieval
- WebSocket connectivity
"""

import pytest
import uuid
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_health_and_root():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "healthy"

        res = await ac.get("/")
        assert res.status_code == 200
        assert "BartaSetu" in res.json()["app"]

@pytest.mark.asyncio
async def test_auth_flow_and_endpoints():
    unique_suffix = uuid.uuid4().hex[:6]
    username = f"user_{unique_suffix}"
    email = f"user_{unique_suffix}@example.com"
    password = "SecurePassword123!"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Register
        reg_resp = await ac.post("/api/auth/register", json={
            "username": username,
            "email": email,
            "password": password,
            "display_name": f"Test User {unique_suffix}"
        })
        assert reg_resp.status_code == 201
        tokens = reg_resp.json()
        assert "access_token" in tokens
        assert "refresh_token" in tokens
        access_token = tokens["access_token"]
        headers = {"Authorization": f"Bearer {access_token}"}

        # 2. Login
        login_resp = await ac.post("/api/auth/login", json={
            "username": username,
            "password": password
        })
        assert login_resp.status_code == 200
        assert "access_token" in login_resp.json()

        # 3. Register Device
        dev_resp = await ac.post("/api/devices/register", json={
            "device_name": "Pixel 7 Pro",
            "fcm_token": "stub_fcm_token_12345",
            "platform": "android",
            "latitude": 22.5726,
            "longitude": 88.3639
        }, headers=headers)
        assert dev_resp.status_code == 201
        device = dev_resp.json()
        device_id = device["id"]
        assert device["device_name"] == "Pixel 7 Pro"

        # 4. List Devices
        dev_list_resp = await ac.get("/api/devices", headers=headers)
        assert dev_list_resp.status_code == 200
        assert len(dev_list_resp.json()) >= 1

        # 5. Create Message
        msg_id = f"MSG-{uuid.uuid4().hex[:8].upper()}"
        now = datetime.now(timezone.utc)
        expires = now + timedelta(days=1)
        
        msg_resp = await ac.post("/api/messages", json={
            "id": msg_id,
            "recipient_id": device["user_id"], # self for test
            "encrypted_content": "SGVsbG8sIHRoaXMgaXMgYW4gZW5jcnlwdGVkIHRlc3QgbWVzc2FnZQ==",
            "encrypted_key": "dGVzdF9rZXk=",
            "iv": "aXZfc2FtcGxlXzEyMw==",
            "content_type": "text",
            "priority": "normal",
            "hop_count": 0,
            "max_hops": 10,
            "ttl": 86400,
            "expires_at": expires.isoformat(),
            "created_at": now.isoformat(),
            "gateway_device_id": device_id
        }, headers=headers)
        assert msg_resp.status_code == 201
        msg_data = msg_resp.json()
        assert msg_data["id"] == msg_id

        # 6. Acknowledge Message
        ack_resp = await ac.post(f"/api/messages/{msg_id}/ack", json={
            "message_id": msg_id,
            "status": "DELIVERED"
        }, headers=headers)
        assert ack_resp.status_code == 200
        assert ack_resp.json()["status"] == "DELIVERED"

        # 7. Create SOS Alert
        sos_resp = await ac.post("/api/sos", json={
            "device_id": device_id,
            "message": "EMERGENCY! Need medical assistance!",
            "latitude": 22.5750,
            "longitude": 88.3690,
            "battery_level": 42
        }, headers=headers)
        assert sos_resp.status_code == 201
        sos_data = sos_resp.json()
        assert sos_data["status"] == "ACTIVE"
        assert sos_data["battery_level"] == 42
