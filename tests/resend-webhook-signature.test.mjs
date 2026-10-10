import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { verifySvixSignature } from "../api/mail/resend-webhook.mjs";

function sign({ payload, id, timestamp, secret }) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const value = crypto
    .createHmac("sha256", key)
    .update(id + "." + timestamp + "." + payload)
    .digest("base64");
  return "v1," + value;
}

test("accepts a valid Svix signature", () => {
  const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "email_123" } });
  const id = "msg_test";
  const timestamp = "1760097600";
  const secret = "whsec_" + Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
  const signature = sign({ payload, id, timestamp, secret });

  assert.equal(
    verifySvixSignature({
      payload,
      id,
      timestamp,
      signature,
      secret,
      now: Number(timestamp) * 1000,
    }),
    true,
  );
});

test("rejects tampered payloads", () => {
  const payload = JSON.stringify({ type: "email.delivered" });
  const id = "msg_test";
  const timestamp = "1760097600";
  const secret = "whsec_" + Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
  const signature = sign({ payload, id, timestamp, secret });

  assert.equal(
    verifySvixSignature({
      payload: payload + " ",
      id,
      timestamp,
      signature,
      secret,
      now: Number(timestamp) * 1000,
    }),
    false,
  );
});

test("rejects stale signatures", () => {
  const payload = "{}";
  const id = "msg_test";
  const timestamp = "1760097600";
  const secret = "whsec_" + Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
  const signature = sign({ payload, id, timestamp, secret });

  assert.equal(
    verifySvixSignature({
      payload,
      id,
      timestamp,
      signature,
      secret,
      now: (Number(timestamp) + 301) * 1000,
    }),
    false,
  );
});
