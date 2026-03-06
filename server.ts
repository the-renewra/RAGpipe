import express from "express";
import { createServer as createViteServer } from "vite";

const app = express();
app.use(express.json());
const PORT = 3000;

// In-memory store for anonymous sessions
const sessions: Record<string, any[]> = {};

app.post("/api/events", (req, res) => {
  const { sessionId, event } = req.body;
  if (!sessionId || !event) {
    return res.status(400).json({ error: "Missing sessionId or event" });
  }
  if (!sessions[sessionId]) {
    sessions[sessionId] = [];
  }
  sessions[sessionId].push({ ...event, timestamp: new Date().toISOString() });
  res.json({ success: true });
});

app.get("/api/events/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  res.json(sessions[sessionId] || []);
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
