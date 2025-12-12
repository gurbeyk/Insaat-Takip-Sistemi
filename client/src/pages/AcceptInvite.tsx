import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { CheckCircle, XCircle, Clock, UserPlus, Building2, Shield, Users, Eye, LogIn } from "lucide-react";

const roleLabels: Record<string, { label: string; icon: typeof Shield; description: string }> = {
  admin: {
    label: "Yönetici",
    icon: Shield,
    description: "Proje ayarlarını düzenleyebilir, üye ekleyip kaldırabilir"
  },
  editor: {
    label: "Editör",
    icon: Users,
    description: "Veri girişi yapabilir, raporları görüntüleyebilir"
  },
  viewer: {
    label: "Görüntüleyici",
    icon: Eye,
    description: "Sadece projeyi ve raporları görüntüleyebilir"
  }
};

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [accepted, setAccepted] = useState(false);

  const handleLogin = () => {
    localStorage.setItem("pendingInviteToken", token || "");
    window.location.href = "/api/login";
  };

  const { data: invitationData, isLoading, error } = useQuery({
    queryKey: ["/api/invitations", token],
    queryFn: async () => {
      const res = await fetch(`/api/invitations/${token}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Davet doğrulanamadı");
      }
      return res.json() as Promise<{
        invitation: {
          id: number;
          name: string;
          email: string;
          role: string;
          expiresAt: string;
          projectId: number;
        };
        projectName: string;
      }>;
    },
    enabled: !!token,
    retry: false
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/invitations/${token}/accept`);
      return res.json();
    },
    onSuccess: (data) => {
      setAccepted(true);
      toast({
        title: "Davet kabul edildi",
        description: "Projeye başarıyla katıldınız."
      });
      setTimeout(() => {
        navigate(`/projects/${data.projectId}`);
      }, 2000);
    },
    onError: (error: Error) => {
      if (error.message.includes("401") || error.message.includes("Unauthorized")) {
        toast({
          title: "Oturum gerekli",
          description: "Daveti kabul etmek için lütfen giriş yapın.",
          variant: "destructive"
        });
        handleLogin();
      } else {
        toast({
          title: "Hata",
          description: error.message || "Davet kabul edilirken bir hata oluştu",
          variant: "destructive"
        });
      }
    }
  });

  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20" />
            <Skeleton className="h-10" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle>Davet Geçersiz</CardTitle>
            <CardDescription>
              {(error as Error).message || "Bu davet linki geçersiz veya süresi dolmuş olabilir."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => navigate("/")}
              data-testid="button-go-home"
            >
              Ana Sayfaya Dön
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle>Davet Kabul Edildi</CardTitle>
            <CardDescription>
              Projeye yönlendiriliyorsunuz...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const roleInfo = invitationData ? roleLabels[invitationData.invitation.role] : null;
  const RoleIcon = roleInfo?.icon || Eye;
  const isExpired = invitationData ? new Date() > new Date(invitationData.invitation.expiresAt) : false;

  if (isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
            <CardTitle>Davet Süresi Dolmuş</CardTitle>
            <CardDescription>
              Bu davet linkinin süresi dolmuş. Lütfen proje yöneticisinden yeni bir davet linki isteyin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => navigate("/")}
              data-testid="button-go-home"
            >
              Ana Sayfaya Dön
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <UserPlus className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>Proje Davetiyesi</CardTitle>
          <CardDescription>
            Bir projeye katılmaya davet edildiniz
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Proje</p>
                <p className="font-medium" data-testid="text-project-name">
                  {invitationData?.projectName}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
              <RoleIcon className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Rol</p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" data-testid="badge-role">
                    {roleInfo?.label || invitationData?.invitation.role}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {roleInfo?.description}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-md bg-muted/50">
              <p className="text-sm text-muted-foreground">Davet edilen</p>
              <p className="font-medium" data-testid="text-invite-name">
                {invitationData?.invitation.name}
              </p>
              <p className="text-sm text-muted-foreground" data-testid="text-invite-email">
                {invitationData?.invitation.email}
              </p>
            </div>
          </div>

          {isAuthenticated ? (
            <Button
              className="w-full"
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending}
              data-testid="button-accept-invite"
            >
              {acceptMutation.isPending ? "Kabul ediliyor..." : "Daveti Kabul Et"}
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-center text-muted-foreground">
                Daveti kabul etmek için giriş yapmanız gerekmektedir.
              </p>
              <Button
                className="w-full"
                onClick={handleLogin}
                data-testid="button-login-to-accept"
              >
                <LogIn className="h-4 w-4 mr-2" />
                Giriş Yap ve Kabul Et
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
