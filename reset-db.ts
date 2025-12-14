import { Pool } from "pg";

// Replit env değişkenlerini otomatik okur
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ HATA: DATABASE_URL bulunamadı!");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
});

async function reset() {
  console.log("⏳ Veritabanına bağlanılıyor...");
  const client = await pool.connect();

  try {
    console.log("🗑️ Eski tablolar ve şema siliniyor (DROP SCHEMA)...");
    // Bu komut "public" şemasını (tüm tabloları) siler ve yeniden boş olarak oluşturur
    await client.query("DROP SCHEMA public CASCADE;");
    await client.query("CREATE SCHEMA public;");
    await client.query("GRANT ALL ON SCHEMA public TO public;");

    console.log("✨ Veritabanı pırıl pırıl oldu! Şimdi 'npm run db:push' çalıştırabilirsin.");
  } catch (err) {
    console.error("❌ Bir hata oluştu:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

reset();