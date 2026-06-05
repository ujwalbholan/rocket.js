# MiniHTTP Technical Specification

MiniHTTP is the TCP-based protocol implemented by Rocket.js.

Version: 1.0

Status: Draft Specification

---

# 1. Terminology

The key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are to be interpreted as described in RFC 2119.

---

# 2. Transport Layer

MiniHTTP operates over TCP.

Each connection carries exactly one request and one response.

Default Port:

3000

Implementations MAY use any port.

---

# 3. Character Encoding

All protocol messages MUST be UTF-8 encoded.

---

# 4. Request Grammar

Request

request =
request-line
headers
CRLF
body

Request Line

request-line =
method SP path

Method

method =
"GET"
| "POST"
| "PUT"
| "DELETE"

Path

path =
"/" \*(CHAR)

Examples

GET /users

POST /users

DELETE /users/123

---

# 5. Header Grammar

header =
header-name ":" SP header-value

Example

Content-Type: application/json

Example

Authorization: Bearer abc123

Implementations MUST trim leading and trailing whitespace.

---

# 6. Body Grammar

body =
\*OCTET

The body starts immediately after the first empty line.

Example

POST /users
Content-Type: application/json

{"name":"bob"}

---

# 7. Response Grammar

response =
status-line
headers
CRLF
body

Status Line

status-line =
"STATUS" SP status-code

Examples

STATUS 200

STATUS 404

STATUS 500

---

# 8. Status Codes

200 Success

201 Created

400 Bad Request

404 Not Found

413 Payload Too Large

500 Internal Server Error

Unknown codes SHOULD be treated as errors.

---

# 9. Request Parsing Rules

Servers MUST:

1. Read the entire request.
2. Parse the request line.
3. Parse headers.
4. Detect the empty line separator.
5. Parse the body.

Servers MUST reject malformed request lines.

Malformed Example

GET

Malformed Example

/users

Response

STATUS 400

Bad Request

---

# 10. Header Parsing Rules

Servers MUST:

- Split on the first colon.
- Trim whitespace.
- Store headers as key-value pairs.

Example

Input:

Content-Type: application/json

Parsed:

{
"Content-Type": "application/json"
}

---

# 11. Routing Rules

Route key format:

<METHOD>:<PATH>

Examples:

GET:/users

POST:/users

DELETE:/users/123

Servers SHOULD use this key for route lookup.

---

# 12. Error Handling

Invalid Method

STATUS 400

Invalid Request Line

STATUS 400

Unknown Route

STATUS 404

Rate Limit Exceeded

STATUS 429

Unhandled Exception

STATUS 500

---

# 13. Content-Type

Supported:

text/plain

application/json

If absent, receivers SHOULD assume text/plain.

---

# 14. Security Considerations

Implementations SHOULD:

- Limit maximum request size
- Validate input
- Prevent route traversal
- Sanitize user input

Implementations MUST NOT trust request bodies.

---

# 15. Compliance Requirements

A MiniHTTP v1 implementation is compliant if it:

- Uses TCP
- Supports request lines
- Supports status lines
- Supports headers
- Supports bodies
- Supports status codes
- Produces valid UTF-8 messages

---

# 16. Future Extensions

Planned for v2:

Connection Keep-Alive

Authentication

Compression

Streaming

Persistent Connections

Chunked Transfer

---

# Appendix A: Complete Example

Client Request

POST /users
Content-Type: application/json
Content-Length: 16

{"name":"luffy"}

Server Response

STATUS 201
Content-Type: application/json; charset=utf-8
Content-Length: 23

{"id":1,"name":"luffy"}

End of Specification.
