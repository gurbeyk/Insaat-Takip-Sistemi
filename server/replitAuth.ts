import { Strategy as LocalStrategy } from "passport-local";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

// Sabit Admin Kullanıcısı
const ADMIN_USER = {
  id: 1,
  username: "admin",
  password: "123456", // Şifreniz
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
  profileImageUrl: "",
};

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  return session({
    secret: process.env.SESSION_SECRET || "varsayilan-gizli-sifre",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // Render'da HTTPS için true olmalı
      maxAge: sessionTtl,
      sameSite: "lax", // Redirect döngülerini önlemek için önemli
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1); // Proxy arkasında (Render) secure cookie için şart
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      if (username === ADMIN_USER.username && password === ADMIN_USER.password) {
        try {
          await storage.upsertUser({
            id: ADMIN_USER.id.toString(),
            email: ADMIN_USER.email,
            firstName: ADMIN_USER.firstName,
            lastName: ADMIN_USER.lastName,
            profileImageUrl: ADMIN_USER.profileImageUrl,
            username: ADMIN_USER.username,
          } as any);
        } catch (e) {
          console.log("User create error (ignore if exists):", e);
        }
        return done(null, ADMIN_USER);
      } else {
        return done(null, false, { message: "Hatalı kullanıcı adı veya şifre" });
      }
    }),
  );

  passport.serializeUser((user, cb) => cb(null, user));
  passport.deserializeUser((user: any, cb) => cb(null, user));

  // --- API ROUTE'LARI ---

  // 1. KULLANICI KONTROLÜ (Eksik olan buydu!)
  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) {
      res.json(req.user);
    } else {
      res.status(401).json(null);
    }
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json({ message: "Giriş başarılı", user: req.user });
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.redirect("/");
    });
  });

  app.get("/api/login-dev", (req, res, next) => {
     req.login(ADMIN_USER, async (err) => {
       if (err) return next(err);
       try {
          await storage.upsertUser({
            id: ADMIN_USER.id.toString(),
            email: ADMIN_USER.email,
            firstName: ADMIN_USER.firstName,
            lastName: ADMIN_USER.lastName,
            profileImageUrl: ADMIN_USER.profileImageUrl,
            username: ADMIN_USER.username,
          } as any);
       } catch(e) { console.log(e); }

       res.redirect("/");
     });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Giriş yapılmadı (Unauthorized)" });
};