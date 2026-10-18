"""Razorpay order creation and payment verification for ad campaign checkout."""

from __future__ import annotations

import hashlib
import hmac
import os
from typing import Any

import requests


class PaymentConfigurationError(RuntimeError):
    """Raised when the Razorpay credentials required for checkout are absent."""


class PaymentProviderError(RuntimeError):
    """Raised when Razorpay rejects or cannot process a payment request."""


class PaymentVerificationError(ValueError):
    """Raised when a payment does not match a captured order."""


class MarketingPaymentService:
    """Create campaign payment orders and verify captured Razorpay payments."""

    _api_url = "https://api.razorpay.com/v1"

    def __init__(self) -> None:
        """Read payment credentials from the process environment."""
        self.key_id = os.getenv("RAZORPAY_KEY_ID", "").strip()
        self.key_secret = os.getenv("RAZORPAY_KEY_SECRET", "").strip()

    def create_order(self, amount_paise: int, campaign_id: str, gym_id: str) -> dict[str, Any]:
        """Create a Razorpay order in INR and return its public checkout details."""
        self._require_credentials()
        try:
            response = requests.post(
                f"{self._api_url}/orders",
                auth=(self.key_id, self.key_secret),
                json={
                    "amount": amount_paise,
                    "currency": "INR",
                    "receipt": campaign_id,
                    "notes": {"campaign_id": campaign_id, "gym_id": gym_id},
                },
                timeout=15,
            )
            response.raise_for_status()
            order: dict[str, Any] = response.json()
        except (requests.RequestException, ValueError) as error:
            raise PaymentProviderError("Razorpay could not initialize campaign checkout.") from error

        if not order.get("id") or order.get("amount") != amount_paise or order.get("currency") != "INR":
            raise PaymentProviderError("Razorpay returned an invalid campaign payment order.")
        return {"order_id": order["id"], "key_id": self.key_id, "amount_paise": amount_paise}

    def verify_captured_payment(
        self, order_id: str, payment_id: str, signature: str, expected_amount_paise: int
    ) -> None:
        """Verify the checkout signature and confirm Razorpay captured the expected amount."""
        self._require_credentials()
        message = f"{order_id}|{payment_id}".encode("utf-8")
        expected_signature = hmac.new(
            self.key_secret.encode("utf-8"), message, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected_signature, signature):
            raise PaymentVerificationError("Razorpay payment signature is invalid.")

        try:
            response = requests.get(
                f"{self._api_url}/payments/{payment_id}",
                auth=(self.key_id, self.key_secret),
                timeout=15,
            )
            response.raise_for_status()
            payment: dict[str, Any] = response.json()
        except (requests.RequestException, ValueError) as error:
            raise PaymentProviderError("Razorpay could not verify the campaign payment.") from error

        if (
            payment.get("order_id") != order_id
            or payment.get("amount") != expected_amount_paise
            or payment.get("currency") != "INR"
            or payment.get("status") != "captured"
        ):
            raise PaymentVerificationError("Campaign payment is not captured for the expected amount.")

    def _require_credentials(self) -> None:
        """Fail explicitly when Razorpay is not configured."""
        if not self.key_id or not self.key_secret:
            raise PaymentConfigurationError("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be configured.")
