"""
Tests for BartaSetu IDs, user lookup, and mesh-relayed delivery:
- register returns a user with a BS- ID
- lookup / search by BartaSetu ID
- a gateway uploading someone else's message keeps the original sender
- undelivered messages show up in the recipient's inbox
- only the recipient (or a relayed ack naming them) can mark a message delivered
"""

import re
import uuid
from datetime import datetime, timezone, timedelta

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


async def register(ac: AsyncClient, label: str) -> dict:
    suffix = uuid.uuid4().hex[:6]
    resp = await ac.post("/api/auth/register", json={
        "username": f"{label}_{suffix}",
        "email": f"{label}_{suffix}@example.com",
        "password": "SecurePassword123!",
        "display_name": f"{label.title()} {suffix}",
    })
    assert resp.status_code == 201, resp.text
    body = resp.json()
    return {"user": body["user"], "headers": {"Authorization": f"Bearer {body['access_token']}"}}


def message_payload(recipient_id: str, **extra) -> dict:
    now = datetime.now(timezone.utc)
    payload = {
        "id": str(uuid.uuid4()),
        "recipient_id": recipient_id,
        "encrypted_content": '{"v":1,"salt":"AA==","iv":"AA==","ct":"AA=="}',
        "content_type": "text",
        "priority": "normal",
        "hop_count": 0,
        "max_hops": 10,
        "ttl": 86400,
        "expires_at": (now + timedelta(days=1)).isoformat(),
        "created_at": now.isoformat(),
    }
    payload.update(extra)
    return payload


@pytest.mark.asyncio
async def test_register_assigns_bs_id_and_lookup_works():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        alice = await register(ac, "alice")
        bob = await register(ac, "bob")

        bs_id = alice["user"]["bs_id"]
        assert re.fullmatch(r"BS-[2-9A-HJ-NP-TV-Z]{6}", bs_id)

        me = await ac.get("/api/users/me", headers=alice["headers"])
        assert me.json()["bs_id"] == bs_id

        # Exact lookup tolerates lowercase and a missing prefix
        for query in (bs_id, bs_id.lower(), bs_id[3:]):
            found = await ac.get(f"/api/users/lookup/{query}", headers=bob["headers"])
            assert found.status_code == 200, query
            assert found.json()["id"] == alice["user"]["id"]
            assert "email" not in found.json()

        # '0' is not in the ID alphabet, so this can never exist
        missing = await ac.get("/api/users/lookup/BS-000000", headers=bob["headers"])
        assert missing.status_code == 404

        search = await ac.get("/api/users/search", params={"q": bs_id[:5]}, headers=bob["headers"])
        assert search.status_code == 200
        assert alice["user"]["id"] in [u["id"] for u in search.json()]


@pytest.mark.asyncio
async def test_gateway_upload_keeps_sender_and_ack_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        sender = await register(ac, "sender")
        gateway = await register(ac, "gateway")
        recipient = await register(ac, "recipient")

        # Sender was offline; a gateway phone uploads the message it carried through the mesh
        payload = message_payload(
            recipient["user"]["id"],
            sender_id=sender["user"]["id"],
            hop_count=2,
            route=[
                {"device_id": sender["user"]["id"], "hop_number": 0, "action": "ORIGIN"},
                {"device_id": str(uuid.uuid4()), "hop_number": 1, "action": "RELAY"},
            ],
        )
        sync = await ac.post("/api/messages/sync", json={"messages": [payload]}, headers=gateway["headers"])
        assert sync.status_code == 200
        [stored] = sync.json()
        assert stored["sender_id"] == sender["user"]["id"]
        assert stored["status"] == "SERVER_RECEIVED"

        # Re-uploading the same packet (arrived via a second path) is idempotent
        again = await ac.post("/api/messages/sync", json={"messages": [payload]}, headers=gateway["headers"])
        assert [m["id"] for m in again.json()] == [payload["id"]]

        inbox = await ac.get("/api/messages/inbox", headers=recipient["headers"])
        assert payload["id"] in [m["id"] for m in inbox.json()]

        # Nobody but the recipient can acknowledge
        forged = await ac.post(f"/api/messages/{payload['id']}/ack",
                               json={"message_id": payload["id"], "status": "DELIVERED"},
                               headers=gateway["headers"])
        assert forged.status_code == 403

        ack = await ac.post(f"/api/messages/{payload['id']}/ack",
                            json={"message_id": payload["id"], "status": "DELIVERED"},
                            headers=recipient["headers"])
        assert ack.status_code == 200

        inbox = await ac.get("/api/messages/inbox", headers=recipient["headers"])
        assert payload["id"] not in [m["id"] for m in inbox.json()]

        statuses = await ac.get("/api/messages/status", params={"ids": payload["id"]}, headers=sender["headers"])
        assert statuses.json() == [{"id": payload["id"], "status": "DELIVERED"}]


@pytest.mark.asyncio
async def test_relayed_ack_must_name_real_recipient():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        sender = await register(ac, "s")
        recipient = await register(ac, "r")
        gateway = await register(ac, "g")

        payload = message_payload(recipient["user"]["id"])
        created = await ac.post("/api/messages", json=payload, headers=sender["headers"])
        assert created.status_code == 201
        assert created.json()["status"] == "SERVER_RECEIVED"

        wrong = await ac.post("/api/messages/acks", json={"acks": [
            {"message_id": payload["id"], "recipient_id": gateway["user"]["id"]},
        ]}, headers=gateway["headers"])
        assert wrong.json()["applied"] == []

        right = await ac.post("/api/messages/acks", json={"acks": [
            {"message_id": payload["id"], "recipient_id": recipient["user"]["id"]},
        ]}, headers=gateway["headers"])
        assert right.json()["applied"] == [payload["id"]]

        msg = await ac.get(f"/api/messages/{payload['id']}", headers=sender["headers"])
        assert msg.json()["status"] == "DELIVERED"


@pytest.mark.asyncio
async def test_relayed_sos_is_attributed_to_origin_user():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        victim = await register(ac, "victim")
        gateway = await register(ac, "gw")
        alert_id = str(uuid.uuid4())
        body = {"alerts": [{
            "id": alert_id, "user_id": victim["user"]["id"], "message": "Trapped",
            "latitude": 22.57, "longitude": 88.36, "battery_level": 12,
        }]}
        first = await ac.post("/api/sos/sync", json=body, headers=gateway["headers"])
        assert first.status_code == 200
        assert first.json()[0]["user_id"] == victim["user"]["id"]

        second = await ac.post("/api/sos/sync", json=body, headers=gateway["headers"])
        assert second.json()[0]["id"] == alert_id


@pytest.mark.asyncio
async def test_sos_without_gps_fix_is_accepted():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        user = await register(ac, "nogps")
        resp = await ac.post("/api/sos", json={"message": "Help, no GPS"}, headers=user["headers"])
        assert resp.status_code == 201
        assert resp.json()["latitude"] is None

        admin_view = await ac.get("/admin/sos")
        mine = [a for a in admin_view.json() if a["id"] == resp.json()["id"]]
        assert mine and mine[0]["location"] is None
