import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BarChart3, Users, FileSpreadsheet, TrendingUp, Building2 } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-primary" />
              <span className="text-xl font-semibold">İnşaat Performans</span>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button asChild data-testid="button-login">
                <a href="/api/login">Giriş Yap</a>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="py-20 md:py-32">
          <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
                İnşaat Projelerinizin
                <span className="text-primary block mt-2">Performansını Takip Edin</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                Günlük adam-saat ve metraj verilerinizi kolayca girin, hedeflerinize göre performansınızı analiz edin, detaylı raporlarla projelerinizi kontrol altında tutun.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" asChild data-testid="button-get-started">
                  <a href="/api/login">Hemen Başlayın</a>
                </Button>
                <Button size="lg" variant="outline" data-testid="button-learn-more">
                  Daha Fazla Bilgi
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
            <h2 className="text-2xl md:text-3xl font-semibold text-center mb-12">
              Öne Çıkan Özellikler
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <FileSpreadsheet className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">Excel Entegrasyonu</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm">
                    İmalat kalemlerinizi ve günlük verilerinizi Excel formatında kolayca yükleyin ve indirin.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <BarChart3 className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">Detaylı Raporlar</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm">
                    Günlük, haftalık, aylık ve kümülatif performans raporlarınızı grafiklerle görüntüleyin.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <TrendingUp className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">Performans Takibi</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm">
                    Adam-saat ve beton miktarlarına göre hedef karşılaştırmalı performans analizi yapın.
                  </CardDescription>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">Çoklu Kullanıcı</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm">
                    Farklı yetki seviyelerinde kullanıcılar ekleyerek ekip çalışmasını kolaylaştırın.
                  </CardDescription>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              <div>
                <div className="text-3xl md:text-4xl font-bold text-primary mb-2">50+</div>
                <div className="text-sm text-muted-foreground">Aktif Proje</div>
              </div>
              <div>
                <div className="text-3xl md:text-4xl font-bold text-primary mb-2">1M+</div>
                <div className="text-sm text-muted-foreground">Adam-Saat Takibi</div>
              </div>
              <div>
                <div className="text-3xl md:text-4xl font-bold text-primary mb-2">100+</div>
                <div className="text-sm text-muted-foreground">Kullanıcı</div>
              </div>
              <div>
                <div className="text-3xl md:text-4xl font-bold text-primary mb-2">%99</div>
                <div className="text-sm text-muted-foreground">Memnuniyet</div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                İnşaat Performans Takip Platformu
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              © 2024 Tüm hakları saklıdır.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
