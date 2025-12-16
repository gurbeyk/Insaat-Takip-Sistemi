import { Strategy as LocalStrategy } from "passport-local";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { storage } from "./storage";

// Admin kullanıcısı için varsayılan şifre (hash'lenmiş)
const ADMIN_PASSWORD_HASH = bcrypt.hashSync("123456", 10);

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
      secure: process.env.NODE_ENV === "production", 
      maxAge: sessionTtl,
      sameSite: "lax",
    },
    proxy: true,
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        // İlk olarak veritabanından kullanıcıyı ara (email veya username ile)
        let user = await storage.getUserByUsername(username);
        if (!user) {
          user = await storage.getUserByEmail(username);
        }

        if (user && user.password) {
          // Veritabanındaki kullanıcı
          const isValid = await bcrypt.compare(password, user.password);
          if (isValid) {
            return done(null, {
              id: user.id,
              username: user.username || user.email,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              profileImageUrl: user.profileImageUrl,
            });
          }
        }

        // Admin kullanıcı kontrolü (geriye dönük uyumluluk)
        if (username === "admin" && password === "123456") {
          const adminUser = await storage.getUserByUsername("admin");
          if (!adminUser) {
            // Admin kullanıcısını oluştur
            const newAdmin = await storage.upsertUser({
              id: "1",
              email: "admin@example.com",
              username: "admin",
              password: ADMIN_PASSWORD_HASH,
              firstName: "Admin",
              lastName: "User",
              profileImageUrl: "",
            });
            return done(null, {
              id: newAdmin.id,
              username: "admin",
              email: newAdmin.email,
              firstName: newAdmin.firstName,
              lastName: newAdmin.lastName,
              profileImageUrl: newAdmin.profileImageUrl,
            });
          } else {
            return done(null, {
              id: adminUser.id,
              username: adminUser.username || "admin",
              email: adminUser.email,
              firstName: adminUser.firstName,
              lastName: adminUser.lastName,
              profileImageUrl: adminUser.profileImageUrl,
            });
          }
        }

        return done(null, false, { message: "Hatalı kullanıcı adı veya şifre" });
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, cb) => cb(null, user));
  passport.deserializeUser((user: any, cb) => cb(null, user));

  // --- API ROUTE'LARI ---

  // KULLANICI KONTROLÜ
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

  // Davet ile kayıt endpointi
  app.post("/api/register-from-invitation", async (req, res, next) => {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json({ message: "Token ve şifre gereklidir" });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Şifre en az 6 karakter olmalıdır" });
      }

      // Daveti kontrol et
      const invitation = await storage.getInvitationByToken(token);
      if (!invitation) {
        return res.status(404).json({ message: "Davet bulunamadı" });
      }

      if (invitation.status !== "pending") {
        return res.status(400).json({ message: "Bu davet zaten kullanılmış" });
      }

      if (new Date() > new Date(invitation.expiresAt)) {
        await storage.updateInvitationStatus(invitation.id, "expired");
        return res.status(400).json({ message: "Davet süresi dolmuş" });
      }

      // Kullanıcının zaten var olup olmadığını kontrol et
      const existingUser = await storage.getUserByEmail(invitation.email);
      if (existingUser) {
        return res.status(400).json({ 
          message: "Bu e-posta adresi zaten kayıtlı. Lütfen giriş yapın." 
        });
      }

      // Şifreyi hashle
      const hashedPassword = await bcrypt.hash(password, 10);

      // Yeni kullanıcı oluştur
      const newUser = await storage.upsertUser({
        email: invitation.email,
        username: invitation.email, // Email'i username olarak kullan
        password: hashedPassword,
        firstName: invitation.name.split(' ')[0] || invitation.name,
        lastName: invitation.name.split(' ').slice(1).join(' ') || '',
        profileImageUrl: "",
      });

      // Kullanıcıyı projeye ekle
      await storage.addProjectMember({
        projectId: invitation.projectId,
        userId: newUser.id,
        role: invitation.role,
      });

      // Daveti kabul edildi olarak işaretle
      await storage.updateInvitationStatus(invitation.id, "accepted");

      // Kullanıcıyı otomatik giriş yap
      const userSession = {
        id: newUser.id,
        username: newUser.username || newUser.email,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        profileImageUrl: newUser.profileImageUrl,
      };

      req.login(userSession, (err) => {
        if (err) {
          console.error("Login error after registration:", err);
          return res.status(500).json({ message: "Kayıt başarılı ancak giriş yapılamadı" });
        }
        res.json({ 
          message: "Kayıt başarılı",
          projectId: invitation.projectId,
          user: userSession 
        });
      });

    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Kayıt sırasında bir hata oluştu" });
    }
  });

  app.get("/api/login-dev", (req, res, next) => {
    const adminUser = {
      id: "1",
      username: "admin",
      email: "admin@example.com",
      firstName: "Admin",
      lastName: "User",
      profileImageUrl: "",
    };
    
    req.login(adminUser, async (err) => {
      if (err) return next(err);
      try {
        await storage.upsertUser({
          id: "1",
          email: "admin@example.com",
          username: "admin",
          password: ADMIN_PASSWORD_HASH,
          firstName: "Admin",
          lastName: "User",
          profileImageUrl: "",
        });
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
