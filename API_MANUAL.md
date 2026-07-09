# Modulo Learn — API Manual

> **For AI Assistants:** This document is structured for machine-readable consumption. Every endpoint
> includes TypeScript types, curl examples, exact JSON shapes, and a "Gotchas" section for the most
> common integration mistakes. Read the [Complete TypeScript SDK](#9-complete-typescript-sdk) section
> first if you are generating client code.

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
9. [Complete TypeScript SDK](#9-complete-typescript-sdk)
10. [Common Mistakes & Gotchas](#10-common-mistakes--gotchas)

---

## TypeScript Types Reference

> **AI note:** Import or copy these types. All request/response shapes below derive from these.

```typescript
// ── Auth ──────────────────────────────────────────────────────────────────
interface SignupRequest  { name: string; email: string; password: string; }
interface SignupResponse { message: string; user: { name: string; email: string; uid: string; }; }

interface LoginRequest  { email: string; password: string; }
interface LoginResponse { message: string; uid: string; email: string; name: string; token: string; }

// MeResponse spreads all Firestore user fields — at minimum { name, email, createdAt } from signup
// plus the token echoed back.
interface MeResponse extends Record<string, unknown> {
  name: string;
  email: string;
  createdAt?: string;  // set during POST /auth/signup
  token: string;        // the same Bearer token that was sent in the Authorization header
}

// ── Ask ───────────────────────────────────────────────────────────────────
interface AskRequest  { url: string; }
interface Timestamp   { start_seconds: number; title: string; }

interface VideoAskResponse {
  type: "video";
  title: string;
  url: string;
  thumbnail: string;
  timestamps: Timestamp[];
}

interface PlaylistVideo { title: string; url: string; thumbnail: string; timestamps: Timestamp[]; }
interface PlaylistAskResponse {
  type: "playlist";
  title: string;
  url: string;
  videos: PlaylistVideo[];
}
type AskResponse = VideoAskResponse | PlaylistAskResponse;

// ── Courses ───────────────────────────────────────────────────────────────
interface LectureInput        { title: string; duration?: number; }
interface CreateCourseRequest { title: string; metadata?: string; lectures: LectureInput[]; }
interface CreateCourseResponse{ message: string; courseId: string; title: string; lectures: number; }

interface EnrollRequest   { deadline: string; }       // ISO date e.g. "2026-09-01"
interface EnrollResponse  { message: string; courseId: string; deadline: string; }

interface CompleteLectureResponse { message: string; }

interface CourseProgress {
  courseTitle: string;
  totalLectures: number;
  completedLectures: number;
  percentage: number;         // Math.round(completedLectures / totalLectures * 100)
  deadline: string | null;
}

type ListCoursesResponse = Array<{
  courseId: string;
  courseTitle: string;
  totalLectures: number;
  completedLectures: number;
  percentage: number;
  deadline: string | null;
}>;

// ── Errors ────────────────────────────────────────────────────────────────
interface ApiError { error: string; }
```

---

## 1. Authentication

All `/auth/*` endpoints are **public** (no `Authorization` header needed).
Course endpoints require a `Bearer` token from `POST /auth/login`.

### 1.1 Signup

Creates a Firebase Auth user and writes `{ name, email, createdAt }` to Firestore.

**Endpoint:** `POST /auth/signup`
**Auth required:** ❌ No

**Request Body:** `SignupRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | ✅ | User's display name |
| `email` | `string` | ✅ | User's email address |
| `password` | `string` | ✅ | Plain-text password |

**Example Request:**
```json
{ "name": "John Doe", "email": "john@example.com", "password": "securePassword123" }
```

**curl:**
```bash
curl -X POST "$BASE_URL/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com","password":"securePassword123"}'
```

**Success Response — `201 Created`:** `SignupResponse`
```json
{
  "message": "User created",
  "user": { "name": "John Doe", "email": "john@example.com", "uid": "abc123def456" }
}
```

**Error Responses:**

| Status | Body | Cause |
|--------|------|-------|
| `400` | `{ "error": "name, email, and password are required" }` | Any field missing |
| `400` | `{ "error": "Email already registered" }` | Duplicate email |

---

### 1.2 Login

Authenticates with email/password via Firebase Identity Toolkit. Returns a Firebase ID Token (JWT).

**Endpoint:** `POST /auth/login`
**Auth required:** ❌ No

**Request Body:** `LoginRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | `string` | ✅ | User's email |
| `password` | `string` | ✅ | User's password |

**curl:**
```bash
curl -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"securePassword123"}'
```

**Success Response — `200 OK`:** `LoginResponse`
```json
{
  "message": "Logged in",
  "uid": "abc123def456",
  "email": "john@example.com",
  "name": "John Doe",
  "token": "eyJhbGciOiJSUzI1NiIs..."
}
```

**Critical fields for frontend:**
- `token` — Firebase ID Token (JWT). **Expires after 1 hour.** Send as `Authorization: Bearer <token>` on all course endpoints.
- `uid` — Firebase UID. Store for display/reference.
- `name` — Fetched from Firestore `users/{uid}.name`, **not** from Firebase Auth `displayName`.

**Error Responses:**

| Status | Body | Cause |
|--------|------|-------|
| `400` | `{ "error": "email and password are required" }` | Missing field |
| `401` | `{ "error": "Invalid email or password" }` | Wrong credentials |
| `500` | `{ "error": "<message>" }` | Unexpected server error |

---

### 1.3 Get Current User

Verifies the token, checks the requested `uid` matches the token owner, and returns all Firestore
user fields plus the token itself. Use this on every app load to validate the session.

**Endpoint:** `GET /auth/me`
**Auth required:** ✅ Yes — `Authorization: Bearer <token>`

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | `string` | ✅ | The Firebase UID of the user whose profile to fetch |

**curl:**
```bash
curl "$BASE_URL/auth/me?uid=abc123def456" \
  -H "Authorization: Bearer $TOKEN"
```

**Success Response — `200 OK`:** `MeResponse`

Returns all fields from the Firestore `users/{uid}` document **spread** into the response,
plus the `token` field echoed back.

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "createdAt": "2026-07-09T18:00:00.000Z",
  "token": "eyJhbGciOiJSUzI1NiIs..."
}
```

> **AI note:**
> - `uid` is **not** returned explicitly — it lives in Firestore but is spread via `...userData`. If
>   you need the uid client-side, store it from the `POST /auth/login` response.
> - `name`, `email`, `createdAt` are written by `POST /auth/signup`. Users created outside this
>   endpoint may have an empty or missing Firestore doc.
> - `token` is the same JWT that was sent in the `Authorization` header — it is echoed back for
>   convenience (e.g., to update storage after a session refresh flow).

**Error Responses:**

| Status | Body | Cause |
|--------|------|-------|
| `400` | `{ "error": "uid query parameter is required" }` | `?uid=` missing from URL |
| `401` | `{ "error": "Missing or invalid Authorization header" }` | No/malformed header |
| `401` | `{ "error": "Invalid or expired token" }` | Expired or bad JWT |
| `403` | `{ "error": "You can only access your own details" }` | Token uid ≠ query uid |

**Frontend pattern:**
- Always include `?uid=<stored_uid>` in the request URL.
- Call on app init. If `401` or `403` → clear stored token → redirect to `/login`.
- ⚠️ **No refresh token endpoint exists.** User must re-login after 1 hour.

---

## 2. Test Endpoint

Simple health check. Returns **plain text**, not JSON.

**Endpoint:** `GET /test`
**Auth required:** ❌ No

**curl:**
```bash
curl "$BASE_URL/test"
```

**Response — `200 OK`:**
```
Up and Running
```

> **AI note:** Response `Content-Type` is `text/plain`. Do **not** call `.json()` on this response.

---

## 3. Ask — YouTube Timestamp Extraction

Accepts a YouTube URL (video or playlist) and returns structured timestamps.

**How it works:**
1. Uses `yt-dlp` to extract existing chapters from the video.
2. If no chapters exist, downloads the transcript and sends it to **Gemini Flash** to generate timestamps.
3. If no transcript either, Gemini uses the video title + description alone.

**Endpoint:** `POST /ask`
**Auth required:** ❌ No — this endpoint is **public**. No `Authorization` header needed.

**Request Body:** `AskRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | `string` | ✅ | Full YouTube video or playlist URL |

**curl:**
```bash
curl -X POST "$BASE_URL/ask" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://youtube.com/watch?v=dQw4w9WgXcQ"}'
```

### 3.1 Video Response — `200 OK` → `VideoAskResponse`

```json
{
  "type": "video",
  "title": "Rick Astley - Never Gonna Give You Up",
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  "timestamps": [
    { "start_seconds": 0,  "title": "Intro"   },
    { "start_seconds": 30, "title": "Verse 1" },
    { "start_seconds": 90, "title": "Chorus"  }
  ]
}
```

> **AI note:** The `source` field (e.g., `"chapters"`, `"gemini"`, `"gemini+transcript"`) is **stripped**
> from the response — it is internal tracking only. Do not expect it in the response.

### 3.2 Playlist Response — `200 OK` → `PlaylistAskResponse`

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
        { "start_seconds": 0,  "title": "Topic 1" },
        { "start_seconds": 45, "title": "Topic 2" }
      ]
    }
  ]
}
```

**Error Responses:**

| Status | Body | Cause |
|--------|------|-------|
| `400` | `{ "error": "url is required" }` | Missing `url` field |
| `500` | `{ "error": "<message>" }` | yt-dlp failure, Gemini error, etc. |

**Frontend integration notes:**
- Feed `timestamps` directly into `POST /courses` as `lectures[]` (see exact mapping in §7).
- `start_seconds` → seek the YouTube player: `player.seekTo(start_seconds, true)`.
- For playlists, iterate `videos[]` and handle each the same as a single video response.
- This endpoint can be **slow** (10–30 s) for large videos without existing chapters — show a loading state.

---

## 4. Courses — Neo4j Graph Database

All course endpoints require **authentication** via `Authorization: Bearer <token>`.
The token must be a valid Firebase ID Token from `POST /auth/login`.

---

### 4.1 Create Course

Stores a course and its lectures in Neo4j.

- Course node: `Course { id, title, metadata }`
- Lecture nodes: `Lecture { id, title, duration }`
- Relationship: `(Course)-[:CONTAINS]->(Lecture)`
- Uses `MERGE` — safe to call again with the same courseId without duplication.

**Endpoint:** `POST /courses`
**Auth required:** ✅ Yes

**Headers:**

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <token>` | ✅ |
| `Content-Type` | `application/json` | ✅ |

**Request Body:** `CreateCourseRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | `string` | ✅ | Course name (typically the video title) |
| `metadata` | `string` | ❌ | YouTube URL or any extra info |
| `lectures` | `LectureInput[]` | ✅ | Array of lecture objects |

Each `LectureInput`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | `string` | ✅ | Lecture/chapter name |
| `duration` | `number` | ❌ | Start position in seconds (defaults to `0`) |

**Example Request (built from `/ask` result):**
```json
{
  "title": "Rick Astley - Never Gonna Give You Up",
  "metadata": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "lectures": [
    { "title": "Intro",   "duration": 0  },
    { "title": "Verse 1", "duration": 30 },
    { "title": "Chorus",  "duration": 90 }
  ]
}
```

**curl:**
```bash
curl -X POST "$BASE_URL/courses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Rick Astley","metadata":"https://...","lectures":[{"title":"Intro","duration":0}]}'
```

**Success Response — `201 Created`:** `CreateCourseResponse`
```json
{
  "message": "Course created",
  "courseId": "course_1720286400000",
  "title": "Rick Astley - Never Gonna Give You Up",
  "lectures": 3
}
```

> ⚠️ **Save the `courseId`** — you need it for every subsequent operation (enroll, progress, mark
> complete). There is **no** "get course by title" endpoint.

**Error Responses:**

| Status | Body | Cause |
|--------|------|-------|
| `400` | `{ "error": "title and lectures[] are required" }` | Missing/empty fields |
| `401` | `{ "error": "Missing or invalid Authorization header" }` | No/malformed header |
| `401` | `{ "error": "Invalid or expired token" }` | Expired JWT |
| `500` | `{ "error": "<neo4j message>" }` | Database error |

---

### 4.2 Enroll User in Course

Creates an `[:ENROLLED_IN]` relationship between the authenticated user and the course, storing
the deadline as a **relationship property**.

**Endpoint:** `POST /courses/:courseId/enroll`
**Auth required:** ✅ Yes

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `courseId` | `string` | The `courseId` from `POST /courses` |

**Request Body:** `EnrollRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `deadline` | `string` | ✅ | ISO date string e.g. `"2026-09-01"` |

**curl:**
```bash
curl -X POST "$BASE_URL/courses/course_1720286400000/enroll" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"deadline":"2026-09-01"}'
```

**Success Response — `200 OK`:** `EnrollResponse`
```json
{ "message": "Enrolled successfully", "courseId": "course_1720286400000", "deadline": "2026-09-01" }
```

**Error Responses:**

| Status | Body | Cause |
|--------|------|-------|
| `400` | `{ "error": "deadline (ISO date) is required" }` | Missing deadline |
| `401` | Auth error (see §1) | — |
| `500` | `{ "error": "<neo4j message>" }` | Database error |

---

### 4.3 Mark Lecture Complete

Creates a `[:COMPLETED]` relationship from the user to the lecture.
**Idempotent** — calling multiple times has no extra effect (safe to call on re-watch).

**Endpoint:** `POST /courses/:courseId/lectures/:lectureId/complete`
**Auth required:** ✅ Yes
**Body:** None required.

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `courseId` | `string` | The course ID |
| `lectureId` | `string` | The lecture ID (see construction formula below) |

### ⚠️ Lecture ID Formula — Most Common Integration Point

Lecture IDs are **generated server-side** during `POST /courses` but **not returned** in any response.
You must construct them client-side using this deterministic formula:

```
lectureId = "lecture_" + courseId + "_" + index
```

Where `index` is the **0-based** position of the lecture in the `lectures[]` array sent to `POST /courses`.

**Examples for `courseId = "course_1720286400000"`:**

| Lecture | Index | lectureId |
|---------|-------|-----------|
| Intro   | 0 | `lecture_course_1720286400000_0` |
| Verse 1 | 1 | `lecture_course_1720286400000_1` |
| Chorus  | 2 | `lecture_course_1720286400000_2` |

**TypeScript helper:**
```typescript
function getLectureId(courseId: string, index: number): string {
  return `lecture_${courseId}_${index}`;
}
```

**curl:**
```bash
curl -X POST "$BASE_URL/courses/course_1720286400000/lectures/lecture_course_1720286400000_0/complete" \
  -H "Authorization: Bearer $TOKEN"
```

**Success Response — `200 OK`:**
```json
{ "message": "Lecture marked as completed" }
```

**Error Responses:**

| Status | Body | Cause |
|--------|------|-------|
| `401` | Auth error | — |
| `500` | `{ "error": "<neo4j message>" }` | Database error |

---

### 4.4 Get Course Progress

Returns completion stats for one course. Computed from graph relationship counts — no JSON blobs.

**Endpoint:** `GET /courses/:courseId/progress`
**Auth required:** ✅ Yes

**curl:**
```bash
curl "$BASE_URL/courses/course_1720286400000/progress" \
  -H "Authorization: Bearer $TOKEN"
```

**Success Response — `200 OK`:** `CourseProgress`
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
| `totalLectures` | `number` | Total lectures in course |
| `completedLectures` | `number` | Lectures this user has completed |
| `percentage` | `number` | `Math.round(completedLectures / totalLectures * 100)` |
| `deadline` | `string \| null` | Enrollment deadline, or `null` if not set |

**Error Responses:**

| Status | Body | Cause |
|--------|------|-------|
| `401` | Auth error | — |
| `500` | `{ "error": "User is not enrolled in this course" }` | No `ENROLLED_IN` edge |
| `500` | `{ "error": "<neo4j message>" }` | Other database error |

---

### 4.5 List Enrolled Courses

Returns all courses the authenticated user is enrolled in, with per-course progress.

**Endpoint:** `GET /courses`
**Auth required:** ✅ Yes

**curl:**
```bash
curl "$BASE_URL/courses" -H "Authorization: Bearer $TOKEN"
```

**Success Response — `200 OK`:** `ListCoursesResponse`
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

> Returns `[]` (empty array) if the user has no enrolled courses — **not a 404**.

**Error Responses:**

| Status | Body | Cause |
|--------|------|-------|
| `401` | Auth error | — |
| `500` | `{ "error": "<message>" }` | Server error |

---

## 5. Help Endpoint

Returns an HTML page with all endpoints documented and curl examples.

**Endpoint:** `GET /help`
**Auth required:** ❌ No

**Response:** `text/html` — rendered styled documentation page.
Open in a browser; do not parse as API data.

---

## 6. Error Handling

All API errors use a single consistent shape:

```json
{ "error": "Human-readable error message" }
```

### HTTP Status Codes

| Code | Meaning | When |
|------|---------|------|
| `200` | OK | Successful GET or POST |
| `201` | Created | Signup, course creation |
| `400` | Bad Request | Missing/invalid request fields |
| `401` | Unauthorized | Missing, invalid, or expired token |
| `500` | Internal Server Error | Neo4j, Gemini, yt-dlp, unexpected failures |

### Recommended Fetch Wrapper

```typescript
const BASE_URL = "https://us-central1-modulo-learn-75e14.cloudfunctions.net/api";

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // Handle plain-text responses (e.g. GET /test)
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof body === "object" ? (body as ApiError).error : body;
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return body as T;
}
```

---

## 7. Complete User Journey

Here is the exact frontend flow with code snippets:

### Step 1: Signup or Login

```typescript
// Signup (new user)
const signup = await apiRequest<SignupResponse>("/auth/signup", {
  method: "POST",
  body: JSON.stringify({ name, email, password }),
});

// OR Login (existing user)
const login = await apiRequest<LoginResponse>("/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
});

// Store these in localStorage or state
const token = login.token;   // JWT, expires in 1 hour
const uid   = login.uid;
const name  = login.name;
```

### Step 2: Verify Session on App Load

```typescript
const storedUid = localStorage.getItem("uid")!; // saved from login
try {
  const me = await apiRequest<MeResponse>(`/auth/me?uid=${storedUid}`, {}, token);
  // Token still valid — continue to dashboard
} catch {
  // 401 (expired), 403 (uid mismatch), or 400 (missing uid) → force re-login
  localStorage.removeItem("token");
  localStorage.removeItem("uid");
  window.location.href = "/login";
}
```

### Step 3: Get YouTube Timestamps

```typescript
// No token needed — /ask is public
const ask = await apiRequest<AskResponse>("/ask", {
  method: "POST",
  body: JSON.stringify({ url: youtubeUrl }),
});

if (ask.type === "video") {
  // use ask.timestamps
} else {
  // ask.type === "playlist" — iterate ask.videos
}
```

### Step 4: Create Course

```typescript
// Map timestamps to lectures
// Use start_seconds as the duration (chapter start position in seconds)
const lectures = ask.timestamps.map((t: Timestamp) => ({
  title: t.title,
  duration: t.start_seconds,
}));

const course = await apiRequest<CreateCourseResponse>(
  "/courses",
  { method: "POST", body: JSON.stringify({ title: ask.title, metadata: ask.url, lectures }) },
  token
);

const courseId = course.courseId; // SAVE THIS — not recoverable later
```

### Step 5: Enroll

```typescript
await apiRequest<EnrollResponse>(
  `/courses/${courseId}/enroll`,
  { method: "POST", body: JSON.stringify({ deadline: "2026-09-01" }) },
  token
);
```

### Step 6: Mark Lectures Complete

```typescript
// When user finishes the lecture at index i (0-based):
const lectureId = `lecture_${courseId}_${i}`;

await apiRequest<CompleteLectureResponse>(
  `/courses/${courseId}/lectures/${lectureId}/complete`,
  { method: "POST" },
  token
);
```

### Step 7: Check Progress

```typescript
const progress = await apiRequest<CourseProgress>(
  `/courses/${courseId}/progress`,
  {},
  token
);
console.log(`${progress.percentage}% complete`);
```

### Step 8: Dashboard — List All Courses

```typescript
const courses = await apiRequest<ListCoursesResponse>("/courses", {}, token);
// courses is an array, possibly empty []
```

---

## 8. Neo4j Graph Schema

The data is stored as a graph in Neo4j AuraDB — not a relational database.

### Node Labels

| Label | Properties | Description |
|-------|-----------|-------------|
| `User` | `{ id: string }` | Firebase Auth UID |
| `Course` | `{ id: string, title: string, metadata: string }` | Course from YouTube timestamps |
| `Lecture` | `{ id: string, title: string, duration: number }` | Chapter/timestamp within a course |

### Relationship Types

| Type | From → To | Properties |
|------|-----------|------------|
| `[:CONTAINS]` | `Course → Lecture` | — |
| `[:ENROLLED_IN]` | `User → Course` | `{ deadline: string }` |
| `[:COMPLETED]` | `User → Lecture` | — |

### Visual Representation

```
(User {id: "abc123"})
  │
  ├──[ENROLLED_IN {deadline: "2026-09-01"}]──▶(Course {id: "course_...", title: "..."})
  │                                                    │
  │                                              [CONTAINS]
  │                                                    │
  │                                                    ├──▶(Lecture {id: "lecture_..._0", title: "Intro"})
  │                                                    ├──▶(Lecture {id: "lecture_..._1", title: "Main"})
  │                                                    └──▶(Lecture {id: "lecture_..._2", title: "Outro"})
  │
  └──[COMPLETED]──▶(Lecture {id: "lecture_..._0"})
```

### Key Rules

1. **No duplicate nodes** — Uses `MERGE` by ID; calling `POST /courses` twice with same payload is safe.
2. **User isolation** — All queries scope to a specific `User` node; never return cross-user data.
3. **Progress by counting relationships** — `percentage = COUNT(COMPLETED) / COUNT(CONTAINS) * 100`.
4. **Deadline on the edge** — `ENROLLED_IN.deadline` allows different users different deadlines for the same course.

### Cypher Queries (Reference for Debugging)

```cypher
-- View all graph data
MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 50

-- View a specific user's enrolled courses with progress
MATCH (u:User {id: "abc123"})-[e:ENROLLED_IN]->(c:Course)
MATCH (c)-[:CONTAINS]->(l:Lecture)
OPTIONAL MATCH (u)-[comp:COMPLETED]->(l)
RETURN c.title, COUNT(l) AS total, COUNT(comp) AS done, e.deadline

-- View all users and their enrollments
MATCH (u:User)-[e:ENROLLED_IN]->(c:Course) RETURN u.id, c.title, e.deadline
```

---

## 9. Complete TypeScript SDK

> **AI note:** Copy-paste this module as your starting point. It wraps every endpoint with full types.

```typescript
// api.ts — Modulo Learn API SDK

const BASE_URL = import.meta.env?.VITE_API_URL
  ?? "https://us-central1-modulo-learn-75e14.cloudfunctions.net/api";

// ── Types ─────────────────────────────────────────────────────────────────

export interface SignupRequest  { name: string; email: string; password: string; }
export interface SignupResponse { message: string; user: { name: string; email: string; uid: string; }; }

export interface LoginRequest   { email: string; password: string; }
export interface LoginResponse  { message: string; uid: string; email: string; name: string; token: string; }

// MeResponse spreads all Firestore user fields plus echoes the token.
export interface MeResponse extends Record<string, unknown> {
  name: string;
  email: string;
  createdAt?: string;
  token: string;
}

export interface Timestamp      { start_seconds: number; title: string; }

export interface VideoAskResponse  { type: "video"; title: string; url: string; thumbnail: string; timestamps: Timestamp[]; }
export interface PlaylistVideo     { title: string; url: string; thumbnail: string; timestamps: Timestamp[]; }
export interface PlaylistAskResponse { type: "playlist"; title: string; url: string; videos: PlaylistVideo[]; }
export type AskResponse = VideoAskResponse | PlaylistAskResponse;

export interface LectureInput         { title: string; duration?: number; }
export interface CreateCourseRequest  { title: string; metadata?: string; lectures: LectureInput[]; }
export interface CreateCourseResponse { message: string; courseId: string; title: string; lectures: number; }

export interface EnrollRequest  { deadline: string; }
export interface EnrollResponse { message: string; courseId: string; deadline: string; }

export interface CourseProgress {
  courseTitle: string; totalLectures: number; completedLectures: number;
  percentage: number; deadline: string | null;
}
export type ListCoursesResponse = Array<{
  courseId: string; courseTitle: string; totalLectures: number;
  completedLectures: number; percentage: number; deadline: string | null;
}>;

// ── Core fetch helper ─────────────────────────────────────────────────────

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const ct   = res.headers.get("content-type") ?? "";
  const body = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error((body as any)?.error ?? `HTTP ${res.status}`);
  return body as T;
}

// ── Auth ──────────────────────────────────────────────────────────────────

export const auth = {
  signup: (data: SignupRequest) =>
    request<SignupResponse>("/auth/signup", { method: "POST", body: JSON.stringify(data) }),

  login: (data: LoginRequest) =>
    request<LoginResponse>("/auth/login",  { method: "POST", body: JSON.stringify(data) }),

  /** uid must match the uid encoded in the token — passing someone else's uid returns 403 */
  me: (token: string, uid: string) =>
    request<MeResponse>(`/auth/me?uid=${encodeURIComponent(uid)}`, {}, token),
};

// ── Ask ───────────────────────────────────────────────────────────────────

export const ask = {
  // No token required — /ask is a public endpoint
  fromUrl: (url: string) =>
    request<AskResponse>("/ask", { method: "POST", body: JSON.stringify({ url }) }),
};

// ── Courses ───────────────────────────────────────────────────────────────

export const courses = {
  create: (data: CreateCourseRequest, token: string) =>
    request<CreateCourseResponse>("/courses", { method: "POST", body: JSON.stringify(data) }, token),

  enroll: (courseId: string, deadline: string, token: string) =>
    request<EnrollResponse>(
      `/courses/${courseId}/enroll`,
      { method: "POST", body: JSON.stringify({ deadline }) },
      token
    ),

  /** lectureIndex is the 0-based position of the lecture in the lectures[] array */
  completeLecture: (courseId: string, lectureIndex: number, token: string) => {
    const lectureId = `lecture_${courseId}_${lectureIndex}`;
    return request<{ message: string }>(
      `/courses/${courseId}/lectures/${lectureId}/complete`,
      { method: "POST" },
      token
    );
  },

  progress: (courseId: string, token: string) =>
    request<CourseProgress>(`/courses/${courseId}/progress`, {}, token),

  list: (token: string) =>
    request<ListCoursesResponse>("/courses", {}, token),
};

// ── Utilities ─────────────────────────────────────────────────────────────

/** Construct a lectureId from courseId and 0-based lecture index */
export function getLectureId(courseId: string, index: number): string {
  return `lecture_${courseId}_${index}`;
}

/** Map /ask timestamps to /courses lectures input */
export function timestampsToLectures(timestamps: Timestamp[]): LectureInput[] {
  return timestamps.map((t) => ({ title: t.title, duration: t.start_seconds }));
}
```

---

## 10. Common Mistakes & Gotchas

> **AI note:** These are the most frequent integration errors when generating client code.

### ❌ Mistake 1: Sending Authorization header to `/ask`

`POST /ask` is **public** — no token is needed. It works without one, but do not assume it requires auth.

```typescript
// ✅ Correct
await request("/ask", { method: "POST", body: JSON.stringify({ url }) });

// ❌ Wrong
await request("/ask", { method: "POST", body: JSON.stringify({ url }) }, token);
```

### ❌ Mistake 2: Using `start_seconds` as the lecture index

`start_seconds` is the **video seek position** (seconds), NOT the array index for constructing `lectureId`.

```typescript
// ✅ Correct — use the 0-based array index from the original lectures[] array
const lectureId = `lecture_${courseId}_${index}`;   // index = 0, 1, 2, ...

// ❌ Wrong — start_seconds is the video timestamp, not the index
const lectureId = `lecture_${courseId}_${timestamp.start_seconds}`;
```

### ❌ Mistake 3: Not saving `courseId` after course creation

`courseId` is returned once in `POST /courses`. There is no "get course by title" endpoint to recover it.

```typescript
// ✅ Persist courseId immediately after creation
const { courseId } = await courses.create(data, token);
// Store in state, localStorage, or your database
```

### ❌ Mistake 4: Not passing `?uid=` to `GET /auth/me`

`GET /auth/me` now **requires** a `?uid=` query parameter. Without it the server returns `400`.
Also, the uid in the query must match the uid in the JWT — passing a different uid returns `403`.

```typescript
// ✅ Correct
const uid = localStorage.getItem("uid"); // stored from login
await apiRequest(`/auth/me?uid=${uid}`, {}, token);

// ❌ Wrong — missing uid param
await apiRequest("/auth/me", {}, token);
```

> **Corollary:** `uid` is **not** in the `GET /auth/me` response body — store it from `POST /auth/login`.

### ❌ Mistake 4b: Expecting `name` from Firebase Auth

`name` in `GET /auth/me` and `POST /auth/login` comes from **Firestore `users/{uid}.name`**, not
Firebase Auth's `displayName`. Users created outside of `POST /auth/signup` will have `name: ""`.

### ❌ Mistake 5: Calling `.json()` on `GET /test`

`GET /test` returns `text/plain`. Use `.text()` or the `apiRequest` wrapper (which checks `content-type`).

### ❌ Mistake 6: Assuming the token auto-refreshes

Firebase ID Tokens expire after **1 hour**. There is no `/auth/refresh` endpoint. After expiry,
any protected endpoint returns `401`. Redirect to login.

```typescript
// ✅ Handle token expiry (pass stored uid)
try {
  const uid = localStorage.getItem("uid")!;
  const me = await auth.me(token, uid);
} catch {
  clearAuth();
  redirectToLogin();
}
```

### ❌ Mistake 7: Treating `GET /courses` as a 404 when empty

When the user has no enrollments, `GET /courses` returns `200` with `[]` — **not a 404**.

```typescript
// ✅ Correct
const list = await courses.list(token); // may be []
if (list.length === 0) renderEmptyState();
```

### ❌ Mistake 8: Forgetting `Content-Type: application/json` on POST requests

POST requests without this header will fail to parse the JSON body. The `apiRequest` wrapper and SDK
set it automatically — only a risk if making raw `fetch` calls manually.
