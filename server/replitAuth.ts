import { Strategy as LocalStrategy } from "passport-local";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

// Sabit Admin Kullanıcısı (Şifre ve Kullanıcı Adı burada)
const ADMIN_USER = {
  id: 1, // Veritabanı ID'si
  username: "admin",
  password: "123456", // BURADAN ŞİFREYİ DEĞİŞTİREBİLİRSİN
  email: "admin@example.com",
  firstName: "Admin",
  lastName: "User",
  profileImageUrl: "",
};

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 7 Günlük oturum
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true, // Tablo yoksa oluştursun
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
      secure: process.env.NODE_ENV === "production", // Sadece Render'da güvenli mod
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // 1. Passport Local Stratejisi (Kullanıcı Adı/Şifre Kontrolü)
  passport.use(
    new LocalStrategy(async (username, password, done) => {
      if (username === ADMIN_USER.username && password === ADMIN_USER.password) {
        // Kullanıcıyı veritabanına kaydet/güncelle (Hata almamak için)
        try {
          await storage.upsertUser({
            id: ADMIN_USER.id.toString(), // ID'yi string'e çeviriyoruz
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

  // --- API ROUTES ---

  // Giriş Yapma (POST isteği ile)
  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json({ message: "Giriş başarılı", user: req.user });
  });

  // Çıkış Yapma
  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.redirect("/");
    });
  });

  // GET Logout (Linkten tıklayınca çıkmak için)
  app.get("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.redirect("/");
    });
  });

  // --- ACİL DURUM GİRİŞİ (Render'da hemen test etmen için) ---
  // Tarayıcıya siteadresi.com/api/login-dev yazınca direkt admin olarak girer.
  app.get("/api/login-dev", (req, res, next) => {
     req.login(ADMIN_USER, async (err) => {
       if (err) return next(err);
       // Kullanıcıyı DB'ye yazalım ki hata vermesin
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

// Kullanıcı Giriş Kontrolü (Middleware)
export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Giriş yapılmadı (Unauthorized)" });
};