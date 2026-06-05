# MiniHTTP Protocol v1

MiniHTTP is the wire protocol used by Rocket.js.

Version: 1.0

Status: Draft

Author: Project Team

---

# Overview

MiniHTTP is a lightweight application-layer protocol built on top of TCP sockets.

The goal of MiniHTTP is educational: to understand how request-response protocols such as HTTP work internally.

MiniHTTP is intentionally simple and human-readable.

---

# Design Goals

- Human-readable messages
- Simple implementation
- Request-response communication model
- TCP-based transport
- Extensible architecture
- Easy debugging using telnet or netcat

---

# Communication Model

MiniHTTP follows a request-response model.

A client sends a request.

The server processes the request.

The server sends a response.

Example:

Client:

GET /hello

Server:

STATUS 200
Content-Type: text/plain; charset=utf-8
Content-Length: 11

hello world

---

# Request Structure

A request consists of:

1. Request Line
2. Headers (optional)
3. Empty Line
4. Body (optional)

General Format:

<METHOD> <PATH>

<HEADER>: <VALUE>
<HEADER>: <VALUE>

<BODY>

Example:

GET /users

Example with Headers:

GET /users
Accept: application/json

Example with Body:

POST /users
Content-Type: application/json
Content-Length: 14

{"name":"bob"}

---

# Request Line

Format:

<METHOD> <PATH>

Example:

GET /users

Example:

POST /users

Rules:

- Method is required
- Path is required
- Method and path are separated by one space

---

# Supported Methods

GET

Used to retrieve resources.

Example:

GET /users

POST

Used to create resources.

Example:

POST /users

PUT

Used to update resources.

Example:

PUT /users/123

DELETE

Used to remove resources.

Example:

DELETE /users/123

---

# Paths

Paths identify resources.

Examples:

/users
/users/123
/posts
/posts/42/comments

Paths are case-sensitive.

---

# Headers

Headers provide metadata.

Format:

<HEADER>: <VALUE>

Example:

Content-Type: application/json

Example:

Authorization: Bearer abc123

Header names are case-insensitive.

---

# Request Body

The body contains request data.

Example:

POST /users
Content-Type: application/json
Content-Length: 14

{"name":"bob"}

The body begins after the first empty line.

Requests with a body MUST include `Content-Length`.

`Content-Length` counts UTF-8 bytes, not JavaScript characters.

Duplicate, invalid, or mismatched `Content-Length` headers MUST be rejected.

---

# Response Structure

A response consists of:

1. Status Line
2. Headers (optional)
3. Empty Line
4. Body (optional)

General Format:

STATUS <CODE>

<HEADER>: <VALUE>

<BODY>

Example:

STATUS 200
Content-Type: text/plain; charset=utf-8
Content-Length: 11

hello world

Rocket.js responses always include `Content-Length`.

Response header names are case-insensitive.

`Content-Length` counts UTF-8 body bytes.

---

# Status Codes

200

Success.

Example:

STATUS 200

201

Resource created.

Example:

STATUS 201

400

Bad request.

Example:

STATUS 400

404

Resource not found.

Example:

STATUS 404

413

Request exceeds the configured size limit.

Example:

STATUS 413

500

Internal server error.

Example:

STATUS 500

---

# Example Request

GET /users

Example Response

STATUS 200
Content-Type: application/json; charset=utf-8
Content-Length: 25

{"users":["alice","bob"]}

---

# Example Create User

Request:

POST /users
Content-Type: application/json
Content-Length: 14

{"name":"bob"}

Response:

STATUS 201
Content-Type: text/plain; charset=utf-8
Content-Length: 12

User created

---

# Error Example

Request:

HELLO /users

Response:

STATUS 400

Invalid Method

---

# Connection Behavior

MiniHTTP v1 uses one request per connection.

Client connects.

Client sends request.

Server sends response.

Connection closes.

Future versions may support persistent connections.

---

# Content Types

Supported values:

text/plain

application/json

Unknown content types may be ignored by implementations.

---

# Versioning

Current Version:

1.0

Future versions may introduce:

- Persistent connections
- Authentication
- Compression
- Streaming
- Chunked transfer

---

# Summary

MiniHTTP v1 provides:

- Request-response communication
- Methods
- Paths
- Headers
- Bodies
- Status codes

while remaining simple enough to implement using Node.js TCP sockets.
