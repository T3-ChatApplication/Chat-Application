# ChatSphere API (Sprint 1)

Base URL: `http://localhost:5000/api`

All protected routes need the header `Authorization: Bearer <token>`.
Error responses look like `{ "message": "Reason" }`.

## Auth

### POST /auth/register
Body:
```json
{ "username": "neel_k", "email": "neel@example.com", "password": "password123" }
```
Rules: username 3-30 chars (letters, numbers, underscore), valid email, password 8-72 chars.

`201 Created`
```json
{ "token": "<jwt>", "user": { "id": "...", "username": "neel_k", "email": "neel@example.com" } }
```
Errors: `400` validation, `409` email or username already registered.

### POST /auth/login
Body: `{ "email": "neel@example.com", "password": "password123" }`

`200 OK` returns the same shape as register. Error: `401 Invalid email or password`.

### GET /auth/me (protected)
Returns `{ "user": { ... } }`. The client calls this on page load to restore the session.

Logout is handled on the client by deleting the stored token.

## Users

### GET /users (protected)
Returns every user except the caller: `{ "users": [ { "id", "username", "email" } ] }`

## Messages

### GET /messages/offline (protected)
Returns all stored messages queued for the caller while they were offline, oldest first.

`200 OK`
```json
{
  "messages": [
    { "id": "...", "conversationId": "...", "sender": "...", "receiver": "...", "text": "Hi", "delivered": false, "status": "sent", "createdAt": "..." }
  ]
}
```

### POST /messages/offline/ack (protected)
Acknowledges and marks offline messages as delivered.

`200 OK`
```json
{ "ok": true, "deliveredCount": 1 }
```

### GET /messages/:userId (protected)
One-to-one history between the caller and `:userId`, oldest first.

Query params: `limit` (default 50, max 200), `before` (ISO date, loads older messages).

`200 OK`
```json
{
  "messages": [
    { "id": "...", "conversationId": "...", "sender": "...", "receiver": "...", "text": "Hi", "createdAt": "2026-10-22T04:30:00.000Z" }
  ]
}
```

## Health

### GET /health
Returns `{ "status": "ok" }`.

## Socket.IO events

Connect with the JWT in the handshake: `io(API_URL, { auth: { token } })`.
Connections without a valid token are rejected with `Authentication failed`.

| Event | Direction | Payload |
|---|---|---|
| `message:send` | client to server | `{ to: "<receiverUserId>", text: "Hello" }` plus an ack callback |
| `message:new` | server to client | Saved message object (same shape as history items) |
| `message:offline` | server to client | `{ messages: [ ... ] }` batch of messages queued while recipient was offline, delivered upon connection |
| `message:delivered` | server to client | `{ to: "<recipientUserId>", messageIds: [ ... ] }` notifies sender when recipient connects and receives queued messages |

Ack response: `{ ok: true, message }` or `{ ok: false, error: "Reason" }`.
The server saves each message to MongoDB first, then emits `message:new` to both the sender and the receiver.
