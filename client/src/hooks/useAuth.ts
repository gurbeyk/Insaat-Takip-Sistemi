import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import type { User } from "@shared/schema";

export type { User };

export function useAuth() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 1. SORGU: Backend'e "Ben kimim?" diye sorar (/api/user)
  const { data: user, error, isLoading } = useQuery<User | null>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      const res = await fetch("/api/user");
      // 401 (Unauthorized) gelirse kullanıcı yok demektir, null döner
      if (res.status === 401) {
        return null;
      }
      if (!res.ok) {
        throw new Error("Kullanıcı bilgisi alınamadı");
      }
      return res.json();
    },
    // Oturum kapalıysa sürekli deneme yapmasın
    retry: false,
    refetchOnWindowFocus: false,
  });

  // 2. LOGOUT İŞLEMİ
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/logout", { method: "POST" });
    },
    onSuccess: () => {
      // Çıkış başarılı olunca kullanıcı verisini sıfırla
      queryClient.setQueryData(["/api/user"], null);
      toast({
        title: "Çıkış Yapıldı",
        description: "Başarıyla çıkış yaptınız.",
      });
      // Login sayfasına yönlendir
      window.location.href = "/login";
    },
    onError: (error: Error) => {
      toast({
        title: "Hata",
        description: "Çıkış yapılırken bir sorun oluştu.",
        variant: "destructive",
      });
    },
  });

  return {
    user,
    // Eğer user verisi varsa isAuthenticated = true olur
    isAuthenticated: !!user,
    isLoading,
    logoutMutation,
  };
}