import express from "express";
import { createServer } from "http";
import { Server as IOServer } from "socket.io";
import jwt from "jsonwebtoken";
import cookie from "cookie";
import dotenv from "dotenv";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { PrismaClient } from "@prisma/client";

dotenv.config();
const prisma = new PrismaClient();

const PORT = Number(process.env.PORT || 4000);
const AUTH_SECRET = process.env.AUTH_SECRET!;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY!;
const REDIS_URL = process.env.REDIS_URL || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";

if (!AUTH_SECRET || !INTERNAL_API_KEY) {
  console.error("Missing AUTH_SECRET or INTERNAL_API_KEY");
  process.exit(1);
}

async function start() {
  const app = express();
  app.use(express.json());

  const server = createServer(app);
  const io = new IOServer(server, {
    cors: { origin: "https://my-job-application.vercel.app", methods: ["GET", "POST"], credentials: true },
    transports: ["websocket"],
    path: "/socket.io",
  });

  // Optional Redis adapter for scaling
  if (REDIS_URL) {
    try {
      const pub = createClient({ url: REDIS_URL });
      const sub = pub.duplicate();
      await pub.connect();
      await sub.connect();
      io.adapter(createAdapter(pub, sub));
      console.log("Redis adapter enabled");
    } catch (e) {
      console.warn("Redis adapter init failed:", e);
    }
  } else {
    console.log("No REDIS_URL — single instance adapter");
  }

  // Socket auth: client passes short-lived token via handshake.auth.token
  io.use((socket, next) => {
    try {
      let token = socket.handshake.auth?.token as string | undefined;
      // fallback: cookie (rare)
      if (!token && socket.handshake.headers.cookie) {
        const parsed = cookie.parse(socket.handshake.headers.cookie);
        token = parsed["next-auth.session-token"] || parsed["__Secure-next-auth.session-token"];
      }
      if (!token) return next(new Error("Unauthorized - no token"));

      const decoded = jwt.verify(token, AUTH_SECRET) as any;
      if (!decoded?.sub) return next(new Error("Unauthorized - invalid token"));
      (socket as any).userId = decoded.sub;
      return next();
    } catch (err) {
      console.error("Socket auth error:", err);
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = (socket as any).userId as string;
    const room = `user:${userId}`;
    socket.join(room);
    console.log(`Socket ${socket.id} connected => ${room}`);

    socket.on("markAsRead", async (ids: string[]) => {
      try {
        if (!Array.isArray(ids) || ids.length === 0) return;
        // update DB (best-effort: you might have already updated via REST)
        await prisma.notification.updateMany({
          where: { id: { in: ids }, receiverId: userId },
          data: { isRead: true },
        });
        // broadcast read update to user's other sockets
        io.to(room).emit("notificationsMarkedRead", ids);
      } catch (e) {
        console.error("markAsRead error:", e);
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(`Socket ${socket.id} disconnected (${reason})`);
    });
  });

  // HTTP endpoint: Next.js calls this after persisting notification
  app.post("/v1/notify", async (req, res) => {
    try {
      const apikey = String(req.headers["x-internal-key"] || "");
      if (apikey !== INTERNAL_API_KEY) return res.status(401).json({ error: "unauthorized" });

      const { receiverId, payload } = req.body;
      if (!receiverId || !payload) return res.status(400).json({ error: "missing receiverId/payload" });

      // If payload has no id, optionally create in DB — but Next.js will persist first (recommended)
      io.to(`user:${receiverId}`).emit("getNotification", payload);
      return res.json({ ok: true });
    } catch (err) {
      console.error("notify error:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // HTTP: tell socket server to broadcast read state
  app.post("/v1/notify-read", async (req, res) => {
    try {
      const apikey = String(req.headers["x-internal-key"] || "");
      if (apikey !== INTERNAL_API_KEY) return res.status(401).json({ error: "unauthorized" });

      const { userId, ids } = req.body;
      if (!userId || !Array.isArray(ids)) return res.status(400).json({ error: "bad payload" });

      io.to(`user:${userId}`).emit("notificationsMarkedRead", ids);
      return res.json({ ok: true });
    } catch (err) {
      console.error("notify-read error:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Realtime server running on 0.0.0.0:${PORT}`);
  });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
