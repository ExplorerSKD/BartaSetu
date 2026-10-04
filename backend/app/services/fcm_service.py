"""
Firebase Cloud Messaging (FCM) Service for BartaSetu.
Handles push notifications to mobile devices when offline or in background.
Gracefully stubs when FCM credentials are not configured.
"""

import logging
import os
from typing import Optional, Dict, Any

logger = logging.getLogger("bartasetu.fcm")

_firebase_initialized = False

def init_firebase(credentials_path: Optional[str] = None):
    global _firebase_initialized
    if _firebase_initialized:
        return
    
    if not credentials_path or not os.path.exists(credentials_path):
        logger.info("FCM credentials not configured or file not found. Push notifications will run in stub/simulation mode.")
        return

    try:
        import firebase_admin
        from firebase_admin import credentials
        cred = credentials.Certificate(credentials_path)
        firebase_admin.initialize_app(cred)
        _firebase_initialized = True
        logger.info("Firebase Admin SDK initialized successfully.")
    except Exception as e:
        logger.warning(f"Failed to initialize Firebase Admin SDK: {e}. Falling back to stub mode.")

async def send_push_notification(
    token: str,
    title: str,
    body: str,
    data: Optional[Dict[str, str]] = None
) -> bool:
    """
    Sends a push notification to an individual device FCM registration token.
    Returns True if sent, False if failed or in stub mode.
    """
    if not token:
        return False

    if not _firebase_initialized:
        logger.info(f"[FCM STUB] Simulated notification to {token[:12]}... | Title: {title} | Body: {body}")
        return True

    try:
        from firebase_admin import messaging
        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            data=data or {},
            token=token,
        )
        response = messaging.send(message)
        logger.info(f"FCM message sent successfully: {response}")
        return True
    except Exception as e:
        logger.error(f"Error sending FCM message to token {token[:12]}...: {e}")
        return False
