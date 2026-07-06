import { Router, Request, Response } from "express";

const router = Router();

router.get("/help", (req: Request, res: Response) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YT Tracker API Guide</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a; color: #e2e8f0; padding: 40px 20px;
      display: flex; justify-content: center;
    }
    .container { max-width: 800px; width: 100%; }
    h1 { font-size: 2rem; margin-bottom: 8px; color: #f8fafc; }
    .subtitle { color: #94a3b8; margin-bottom: 32px; font-size: 0.95rem; }
    .endpoint {
      background: #1e293b; border-radius: 12px; padding: 24px; margin-bottom: 20px;
      border: 1px solid #334155;
    }
    .method {
      display: inline-block; padding: 4px 10px; border-radius: 6px;
      font-size: 0.8rem; font-weight: 700; letter-spacing: 0.5px;
      margin-right: 12px;
    }
    .get { background: #1a4731; color: #4ade80; }
    .post { background: #1e3a5f; color: #60a5fa; }
    .put { background: #4a3a0e; color: #facc15; }
    .delete { background: #4a1a1a; color: #f87171; }
    .url {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 1rem; display: inline-block;
    }
    .url-segment { color: #e2e8f0; }
    .url-param { color: #c084fc; font-weight: 600; }
    .url-placeholder { color: #fbbf24; font-weight: 600; }
    .description { margin-top: 12px; color: #94a3b8; font-size: 0.9rem; }
    .body-section { margin-top: 12px; }
    .body-title { font-size: 0.85rem; color: #64748b; margin-bottom: 8px; }
    .body-grid {
      display: flex; flex-wrap: wrap; gap: 8px;
    }
    .field {
      background: #0f172a; padding: 8px 14px; border-radius: 8px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.85rem;
      border: 1px solid #334155;
    }
    .field-name { color: #2dd4bf; }
    .field-type { color: #94a3b8; }
    .field-required { color: #f87171; margin-left: 4px; }
    .base-url {
      background: #0f172a; border-radius: 8px; padding: 12px 16px;
      font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; color: #64748b;
      margin-bottom: 28px; border: 1px solid #334155;
    }
    .base-url span { color: #38bdf8; }
    .example-box {
      margin-top: 14px; background: #0f172a; border-radius: 8px; padding: 12px 16px;
      border: 1px solid #334155; position: relative;
    }
    .example-label {
      font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 1px;
      margin-bottom: 6px;
    }
    .example-code {
      font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.85rem;
      color: #a5b4fc; word-break: break-all; line-height: 1.6;
    }
    .example-code .comment { color: #64748b; }
    .example-code .string { color: #fbbf24; }
    .example-code .key { color: #2dd4bf; }
    .footer { text-align: center; color: #475569; font-size: 0.85rem; margin-top: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>YT Tracker API</h1>
    <p class="subtitle">Guide to all available endpoints</p>

    <div class="base-url">
      Base URL: <span>http://localhost:5001/modulo-learn-75e14/us-central1/api</span>
    </div>

    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="url">
        <span class="url-segment">/</span><span class="url-segment">test</span>
      </span>
      <div class="description">Health check — returns <strong>"Up and Running"</strong> if the API is live.</div>
      <div class="example-box">
        <div class="example-label">Example</div>
        <div class="example-code">curl http://localhost:5001/modulo-learn-75e14/us-central1/api/test</div>
      </div>
    </div>

    <div class="endpoint">
      <span class="method post">POST</span>
      <span class="url">
        <span class="url-segment">/</span><span class="url-segment">auth</span><span class="url-segment">/</span><span class="url-param">signup</span>
      </span>
      <div class="description">Create a new user account.</div>
      <div class="body-section">
        <div class="body-title">Request Body</div>
        <div class="body-grid">
          <div class="field"><span class="field-name">name</span> <span class="field-type">string</span> <span class="field-required">*</span></div>
          <div class="field"><span class="field-name">email</span> <span class="field-type">string</span> <span class="field-required">*</span></div>
          <div class="field"><span class="field-name">password</span> <span class="field-type">string</span> <span class="field-required">*</span></div>
        </div>
      </div>
      <div class="example-box">
        <div class="example-label">Example</div>
        <div class="example-code">
          <span class="comment"># Create a new user</span><br>
          curl -X POST http://localhost:5001/modulo-learn-75e14/us-central1/api/auth/signup \<br>
          &nbsp;&nbsp;-H <span class="string">"Content-Type: application/json"</span> \<br>
          &nbsp;&nbsp;-d <span class="string">'{ <span class="key">"name"</span>: "John Doe", <span class="key">"email"</span>: "john@example.com", <span class="key">"password"</span>: "secure123" }'</span>
        </div>
      </div>
    </div>

    <div class="endpoint">
      <span class="method post">POST</span>
      <span class="url">
        <span class="url-segment">/</span><span class="url-segment">auth</span><span class="url-segment">/</span><span class="url-param">login</span>
      </span>
      <div class="description">Authenticate with existing credentials.</div>
      <div class="body-section">
        <div class="body-title">Request Body</div>
        <div class="body-grid">
          <div class="field"><span class="field-name">email</span> <span class="field-type">string</span> <span class="field-required">*</span></div>
          <div class="field"><span class="field-name">password</span> <span class="field-type">string</span> <span class="field-required">*</span></div>
        </div>
      </div>
      <div class="example-box">
        <div class="example-label">Example</div>
        <div class="example-code">
          <span class="comment"># Log in with existing credentials</span><br>
          curl -X POST http://localhost:5001/modulo-learn-75e14/us-central1/api/auth/login \<br>
          &nbsp;&nbsp;-H <span class="string">"Content-Type: application/json"</span> \<br>
          &nbsp;&nbsp;-d <span class="string">'{ <span class="key">"email"</span>: "john@example.com", <span class="key">"password"</span>: "secure123" }'</span>
        </div>
      </div>
    </div>

    <div class="endpoint">
      <span class="method get">GET</span>
      <span class="url">
        <span class="url-segment">/</span><span class="url-segment">help</span>
      </span>
      <div class="description">You're looking at it <span style="color: #475569;">&#128521;</span></div>
      <div class="example-box">
        <div class="example-label">Example</div>
        <div class="example-code">curl http://localhost:5001/modulo-learn-75e14/us-central1/api/help</div>
      </div>
    </div>

    <div class="footer">YT Tracker API &mdash; Built with Express + Firebase</div>
  </div>
</body>
</html>`;

  res.status(200).type("html").send(html);
});

export default router;
