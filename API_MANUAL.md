# Modulo Learn — API Manual

**Base URL (emulator):** `http://127.0.0.1:5001/modulo-learn-75e14/us-central1/api`
**Base URL (production):** `https://us-central1-modulo-learn-75e14.cloudfunctions.net/api`

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Test Endpoint](#2-test-endpoint)
3. [Ask — YouTube Timestamp Extraction](#3-ask--youtube-timestamp-extraction)
4. [Courses — Neo4j Graph Database](#4-courses--neo4j-graph-database)
5. [Help](#5-help-endpoint)
6. [Error Handling](#6-error-handling)
7. [Complete User Journey](#7-complete-user-journey)
8. [Neo4j Graph Schema](#8-neo4j-graph-schema)

---

## 1. Authentication

All auth endpoints are **unauthenticated** (public). Course endpoints require a `Bearer` token obtained from login.

### 1.1 Signup

Creates a Firebase Auth user and stores `{ name, email }` in Firestore.

**Endpoint:** `POST /auth/signup`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | User's display name |
| `email` | `string` | Yes | User's email address |
| `password` | `string` | Yes | Plain text password |

**Example Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Success Response — `201 Created`:**
```json
{
  "message": "User created",
  "user": {
    "name": "John Doe",
    "email": "john@example.com",
    "uid": "abc123def456"
  }
}
```

**Error Responses:**
- `400` — Missing fields: `{ "error": "name, email, and password are required" }`
- `400` — Duplicate email: `{ "error": "Email already registered" }`

---

### 1.2 Login

Authenticates with email/password and returns a Firebase ID token.

**Endpoint:** `POST /auth/login`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | `string` | Yes | User's email |
| `password` | `string` | Yes | User's password |

**Example Request:**
```json
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Success Response — `200 OK`:**
```json
{
  "message": "Logged in",
  "uid": "abc123def456",
  "email": "john@example.com",
  "name": "John Doe",
  "token": "eyJhbGciOiJSUzI1NiIs..."
}
```

**Important fields for frontend:**
- `uid` — Unique user ID, stored for future user identification
- `token` — Firebase ID Token (JWT). Must be saved and sent as `Authorization: Bearer <token>` on all course endpoints. Expires after 1 hour.
- `name` — User's display name

**Error Responses:**
- `400` — Missing fields: `{ "error": "email and password are required" }`
- `401` — Wrong credentials: `{ "error": "Invalid email or password" }`

---

### 1.3 Get Current User

Returns the authenticated user's profile. Use this on page load to verify the token is still valid and get user data.

**Endpoint:** `GET /auth/me`

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | Yes |

**Success Response — `200 OK`:**
```json
{
  "uid": "abc123def456",
  "email": "john@example.com",
  "name": "John Doe"
}
```

**Error Responses:**
- `401` — Missing/invalid token: `{ "error": "Missing or invalid Authorization header" }`
- `401` — Expired token: `{ "error": "Invalid or expired token" }`

**Frontend notes:**
- Call this on app initialization to check if the stored token is still valid
- If it returns `401`, redirect to login page
- No refresh token endpoint exists yet — user must re-login when token expires

---

## 2. Test Endpoint

Simple health check to confirm the API is running.

**Endpoint:** `GET /test`

**Response — `200 OK`:**
```
Up and Running
```
(Plain text, not JSON)

---

## 3. Ask — YouTube Timestamp Extraction

Accepts a YouTube URL (video or playlist) and returns structured timestamps. Uses `yt-dlp` to extract existing chapters, or Gemini Flash to generate them if none exist.

**Endpoint:** `POST /ask`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | `string` | Yes | Full YouTube video or playlist URL |

**Example Request:**
```json
{
  "url": "https://youtube.com/watch?v=dQw4w9WgXcQ"
}
```

### 3.1 Video Response — `200 OK`

```json
{
  "type": "video",
  "title": "Rick Astley - Never Gonna Give You Up",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  "timestamps": [
    { "start_seconds": 0, "title": "Intro" },
    { "start_seconds": 30, "title": "Verse 1" },
    { "start_seconds": 90, "title": "Chorus" }
  ]
}
```

### 3.2 Playlist Response — `200 OK`

```json
{
  "type": "playlist",
  "title": "My Awesome Playlist",
  "url": "https://youtube.com/playlist?list=PL...",
  "videos": [
    {
      "title": "Video 1 Title",
      "url": "https://www.youtube.com/watch?v=...",
      "thumbnail": "https://i.ytimg.com/vi/.../hqdefault.jpg",
      "timestamps": [
        { "start_seconds": 0, "title": "Topic 1" },
        { "start_seconds": 45, "title": "Topic 2" }
      ]
    },
    {
      "title": "Video 2 Title",
      "url": "https://www.youtube.com/watch?v=...",
      "thumbnail": "https://i.ytimg.com/vi/.../hqdefault.jpg",
      "timestamps": [
        { "start_seconds": 0, "title": "Start" },
        { "start_seconds": 60, "title": "Main Content" }
      ]
    }
  ]
}
```

**Error Responses:**
- `400` — Missing URL: `{ "error": "url is required" }`
- `500` — yt-dlp/Gemini error: `{ "error": "describe error" }`

**Frontend notes:**
- The `timestamps` array feeds directly into `POST /courses` as the `lectures[]` array
- `start_seconds` can be used to seek the YouTube player to that position
- The `source` field is intentionally omitted from the response (internal tracking only)
- For playlists, process each video's timestamps the same way as a single video

---

## 4. Courses — Neo4j Graph Database

All course endpoints require **authentication** via `Authorization: Bearer <token>`.

The token must be a valid Firebase ID Token obtained from `POST /auth/login` or `GET /auth/me`.

### 4.1 Create Course

Stores a course and its lectures in Neo4j. Lectures become nodes connected to the course via `[:CONTAINS]` relationships.

**Endpoint:** `POST /courses`

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | Yes |
| `Content-Type` | `application/json` | Yes |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | `string` | Yes | Course name (usually the video title) |
| `metadata` | `string` | No | YouTube URL or any extra info |
| `lectures` | `array` | Yes | Array of lecture objects (from `/ask` timestamps) |

Each lecture object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | `string` | Yes | Lecture/chapter name |
| `duration` | `number` | No | Duration in seconds (defaults to 0) |

**Example Request (from `/ask` result):**
```json
{
  "title": "Rick Astley - Never Gonna Give You Up",
  "metadata": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "lectures": [
    { "title": "Intro", "duration": 0 },
    { "title": "Verse 1", "duration": 30 },
    { "title": "Chorus", "duration": 90 }
  ]
}
```

**Success Response — `201 Created`:**
```json
{
  "message": "Course created",
  "courseId": "course_1720286400000",
  "title": "Rick Astley - Never Gonna Give You Up",
  "lectures": 3
}
```

**Important:** Save the `courseId` — you need it for enroll, progress, and marking lectures complete.

**Error Responses:**
- `400` — Missing title or lectures: `{ "error": "title and lectures[] are required" }`
- `401` — Auth failure: `{ "error": "Missing or invalid Authorization header" }` or `{ "error": "Invalid or expired token" }`
- `500` — Neo4j error: `{ "error": "error message" }`

---

### 4.2 Enroll User in Course

Creates an `[:ENROLLED_IN]` relationship between the authenticated user and the course, with a deadline stored as a relationship property.

**Endpoint:** `POST /courses/:courseId/enroll`

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | Yes |
| `Content-Type` | `application/json` | Yes |

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `courseId` | `string` | The course ID returned from `POST /courses` |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `deadline` | `string` | Yes | ISO date string e.g. `"2026-09-01"` or `"2026-09-01T23:59:59Z"` |

**Example Request:**
```json
{
  "deadline": "2026-09-01"
}
```

**Success Response — `200 OK`:**
```json
{
  "message": "Enrolled successfully",
  "courseId": "course_1720286400000",
  "deadline": "2026-09-01"
}
```

**Error Responses:**
- `400` — Missing deadline: `{ "error": "deadline (ISO date) is required" }`
- `401` — Auth failure
- `500` — Neo4j error

---

### 4.3 Mark Lecture Complete

Creates a `[:COMPLETED]` relationship from the user to the lecture. Idempotent — calling multiple times has no extra effect.

**Endpoint:** `POST /courses/:courseId/lectures/:lectureId/complete`

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | Yes |

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `courseId` | `string` | The course ID |
| `lectureId` | `string` | The lecture ID (returned in course creation or predictable format: `lecture_{courseId}_{index}`) |

**Lecture ID format:** `lecture_{courseId}_{index}` — e.g., if courseId is `course_1720286400000` and the lecture is the 3rd one (index 2), the lectureId is `lecture_course_1720286400000_2`.

**No request body required.**

**Success Response — `200 OK`:**
```json
{
  "message": "Lecture marked as completed"
}
```

**Error Responses:**
- `401` — Auth failure
- `500` — Neo4j error

**Frontend notes:**
- Call this when the user finishes watching a lecture/chapter
- The lecture IDs are not returned in the `/ask` or `/courses` responses. You must construct them using the format: `lecture_{courseId}_{index}`
- Example: courseId = `course_1720286400000`, index 0 → `lecture_course_1720286400000_0`

---

### 4.4 Get Course Progress

Calculates completion percentage by counting `[:COMPLETED]` relationships relative to `[:CONTAINS]` relationships using Cypher queries — no JSON blobs.

**Endpoint:** `GET /courses/:courseId/progress`

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | Yes |

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `courseId` | `string` | The course ID |

**Success Response — `200 OK`:**
```json
{
  "courseTitle": "Rick Astley - Never Gonna Give You Up",
  "totalLectures": 3,
  "completedLectures": 1,
  "percentage": 33,
  "deadline": "2026-09-01"
}
```

**Field descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| `courseTitle` | `string` | Name of the course |
| `totalLectures` | `number` | Total number of lectures in the course |
| `completedLectures` | `number` | Number of lectures the user has completed |
| `percentage` | `number` | `Math.round((completedLectures / totalLectures) * 100)` |
| `deadline` | `string \| null` | The deadline set on enrollment, or null |

**Error Responses:**
- `401` — Auth failure
- `500` — Not enrolled: `{ "error": "User is not enrolled in this course" }`

---

### 4.5 List Enrolled Courses

Returns all courses the authenticated user is enrolled in, with progress for each.

**Endpoint:** `GET /courses`

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | Yes |

**Success Response — `200 OK`:**
```json
[
  {
    "courseId": "course_1720286400000",
    "courseTitle": "Rick Astley - Never Gonna Give You Up",
    "totalLectures": 3,
    "completedLectures": 1,
    "percentage": 33,
    "deadline": "2026-09-01"
  },
  {
    "courseId": "course_1720286500000",
    "courseTitle": "Another Course",
    "totalLectures": 5,
    "completedLectures": 5,
    "percentage": 100,
    "deadline": "2026-08-15"
  }
]
```

**Error Responses:**
- `401` — Auth failure
- `500` — Server error

---

## 5. Help Endpoint

Returns an HTML page with all endpoints documented and curl examples.

**Endpoint:** `GET /help`

**Response:** `HTML` — rendered styled documentation page. Open in a browser, not as API data.

---

## 6. Error Handling

All errors follow a consistent format:

```json
{
  "error": "Human-readable error message"
}
```

### HTTP Status Codes Used

| Code | Meaning | When |
|------|---------|------|
| `200` | OK | Successful GET or POST |
| `201` | Created | Resource successfully created (signup, course) |
| `400` | Bad Request | Missing or invalid fields in request body |
| `401` | Unauthorized | Missing, invalid, or expired auth token |
| `500` | Internal Server Error | Server-side failure (Neo4j, Gemini, yt-dlp, etc.) |

### Frontend Error Handling Pattern

```typescript
// Recommended fetch wrapper pattern
async function apiRequest(endpoint: string, options?: RequestInit) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Request failed");
  }

  // Handle non-JSON responses (like /test)
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return response.json();
  }
  return response.text();
}
```

---

## 7. Complete User Journey

Here is the full flow a frontend should implement:

### Step 1: Signup or Login

```
POST /auth/signup  →  { user: { uid, name, email } }
// or
POST /auth/login   →  { uid, name, email, token }
```

**Store in frontend:** `uid`, `token`, `name`, `email` (localStorage/sessionStorage)

### Step 2: Verify Session on App Load

```
GET /auth/me  (Authorization: Bearer <token>)
→  { uid, email, name }  or  401 (redirect to login)
```

### Step 3: Get YouTube Timestamps

```
POST /ask  { url: "https://youtube.com/watch?v=..." }
→  { type: "video", title, thumbnail, timestamps: [...] }
```

### Step 4: Create Course in Neo4j

```
POST /courses  (Authorization: Bearer <token>)
{
  title: result.title,
  metadata: result.url,
  lectures: result.timestamps.map(t => ({
    title: t.title,
    duration: t.start_seconds  // or 0 if start_seconds is the next timestamp
  }))
}
→  { courseId: "course_...", lectures: 5 }
```

**Store in frontend:** `courseId`

### Step 5: Enroll

```
POST /courses/{courseId}/enroll  (Authorization: Bearer <token>)
{ deadline: "2026-09-01" }
→  { message: "Enrolled successfully" }
```

### Step 6: Mark Lectures Complete (as user watches)

```
POST /courses/{courseId}/lectures/{lectureId}/complete  (Authorization: Bearer <token>)
→  { message: "Lecture marked as completed" }
```

### Step 7: Check Progress

```
GET /courses/{courseId}/progress  (Authorization: Bearer <token>)
→  { percentage: 33, totalLectures: 3, completedLectures: 1, deadline: "..." }
```

### Step 8: Dashboard — List All Courses

```
GET /courses  (Authorization: Bearer <token>)
→  [ { courseId, courseTitle, percentage, deadline, ... } ]
```

---

## 8. Neo4j Graph Schema

The data is stored as a graph in Neo4j AuraDB. This is not RESTful — it's a graph database.

### Node Labels

| Label | Properties | Description |
|-------|-----------|-------------|
| `User` | `{ id: string }` | Identified by Firebase Auth UID |
| `Course` | `{ id: string, title: string, metadata: string }` | A course created from YouTube timestamps |
| `Lecture` | `{ id: string, title: string, duration: number }` | A chapter/timestamp within a course |

### Relationship Types

| Type | From | To | Properties |
|------|------|----|------------|
| `[:CONTAINS]` | `Course` | `Lecture` | — |
| `[:ENROLLED_IN]` | `User` | `Course` | `{ deadline: string }` |
| `[:COMPLETED]` | `User` | `Lecture` | — |

### Visual Representation

```
(User {id: "abc123"})
  │
  ├──[ENROLLED_IN {deadline: "2026-09-01"}]──▶(Course {id: "course_...", title: "..."})
  │                                                    │
  │                                              [CONTAINS]
  │                                                    │
  │                                                    ├──▶(Lecture {id: "lecture_..._0", title: "Intro"})
  │                                                    │
  │                                                    ├──▶(Lecture {id: "lecture_..._1", title: "Main"})
  │                                                    │
  └──[COMPLETED]──▶(Lecture {id: "lecture_..._0"})     │
                                                       └──▶(Lecture {id: "lecture_..._2", title: "Outro"})
```

### Key Rules

1. **No redundant course nodes** — Uses `MERGE` to avoid duplicating courses by ID
2. **Logical isolation** — All queries scope to a specific User node; never cross-user
3. **Progress calculated by counting relationships** — `percentage = COUNT(COMPLETED) / COUNT(CONTAINS) * 100`, not from JSON blobs
4. **Deadline on the edge** — The deadline is a property of `ENROLLED_IN`, not on User or Course nodes, so different users can have different deadlines for the same course

### Cypher Queries (Reference for Debugging)

```cypher
-- View all your graph data
MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 50

-- View a specific user's enrolled courses with progress
MATCH (u:User {id: "abc123"})-[e:ENROLLED_IN]->(c:Course)
MATCH (c)-[:CONTAINS]->(l:Lecture)
OPTIONAL MATCH (u)-[comp:COMPLETED]->(l)
RETURN c.title, COUNT(l) AS total, COUNT(comp) AS done, e.deadline

-- View all users and their enrollments
MATCH (u:User)-[e:ENROLLED_IN]->(c:Course) RETURN u.id, c.title, e.deadline
```
