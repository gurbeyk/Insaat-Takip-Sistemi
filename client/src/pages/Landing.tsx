import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, Users, FileSpreadsheet, TrendingUp, Building2, Loader2 } from "lucide-react";

export default function Landing() {
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        window.location.href = "/";
      } else {
        const data = await response.json();
        toast({
          title: "Giriş Başarısız",
          description: data.message || "Kullanıcı adı veya şifre hatalı",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: "Bağlantı hatası oluştu",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

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
              <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-login">Giriş Yap</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Giriş Yap</DialogTitle>
                    <DialogDescription>
                      Hesabınıza giriş yapın
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="username">Kullanıcı Adı</Label>
                      <Input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Kullanıcı adınızı girin"
                        required
                        data-testid="input-username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Şifre</Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Şifrenizi girin"
                        required
                        data-testid="input-password"
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={isLoading}
                      data-testid="button-submit-login"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Giriş yapılıyor...
                        </>
                      ) : (
                        "Giriş Yap"
                      )}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
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
                <Button size="lg" onClick={() => setIsOpen(true)} data-testid="button-get-started">
                  Hemen Başlayın
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
