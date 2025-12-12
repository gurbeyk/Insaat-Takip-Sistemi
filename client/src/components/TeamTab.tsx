import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, UserPlus, Crown, Shield, Eye, Trash2, Link2, Copy, Check, Mail, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Project, User, ProjectMember, ProjectInvitation } from "@shared/schema";

interface ProjectMemberWithUser extends ProjectMember {
  user: User | null;
}

interface MembersResponse {
  members: ProjectMemberWithUser[];
  createdBy: string | null;
  isAdmin: boolean;
}

interface TeamTabProps {
  project: Project;
}

const roleLabels: Record<string, { label: string; icon: typeof Crown }> = {
  admin: { label: "Yönetici", icon: Shield },
  editor: { label: "Editör", icon: Users },
  viewer: { label: "Görüntüleyici", icon: Eye },
};

export function TeamTab({ project }: TeamTabProps) {
  const { toast } = useToast();
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("viewer");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const { data: membersData, isLoading: membersLoading } = useQuery<MembersResponse>({
    queryKey: ["/api/projects", project.id, "members"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${project.id}/members`);
      return res.json();
    },
  });

  const { data: allUsers, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const { data: invitations } = useQuery<ProjectInvitation[]>({
    queryKey: ["/api/projects", project.id, "invitations"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/projects/${project.id}/invitations`);
      return res.json();
    },
  });

  const createInvitationMutation = useMutation({
    mutationFn: async ({ name, email, role }: { name: string; email: string; role: string }) => {
      const res = await apiRequest("POST", `/api/projects/${project.id}/invitations`, {
        name,
        email,
        role,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to create invitation");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "invitations"] });
      setInviteOpen(false);
      setInviteName("");
      setInviteEmail("");
      setInviteRole("viewer");
      toast({
        title: "Davet oluşturuldu",
        description: "Davet linki hazır. Linki kopyalayıp paylaşabilirsiniz.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Hata",
        description: error.message || "Davet oluşturulurken bir hata oluştu.",
        variant: "destructive",
      });
    },
  });

  const deleteInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await apiRequest("DELETE", `/api/projects/${project.id}/invitations/${invitationId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete invitation");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "invitations"] });
      toast({
        title: "Davet silindi",
        description: "Davet başarıyla silindi.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Hata",
        description: error.message || "Davet silinirken bir hata oluştu.",
        variant: "destructive",
      });
    },
  });

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
    toast({
      title: "Link kopyalandı",
      description: "Davet linki panoya kopyalandı.",
    });
  };

  const addMemberMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await apiRequest("POST", `/api/projects/${project.id}/members`, {
        userId,
        role,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to add member");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "members"] });
      setAddMemberOpen(false);
      setSelectedUserId("");
      setSelectedRole("viewer");
      toast({
        title: "Üye eklendi",
        description: "Proje üyesi başarıyla eklendi.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Hata",
        description: error.message || "Üye eklenirken bir hata oluştu.",
        variant: "destructive",
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await apiRequest("PATCH", `/api/projects/${project.id}/members/${userId}`, {
        role,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update role");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "members"] });
      toast({
        title: "Rol güncellendi",
        description: "Üye rolü başarıyla güncellendi.",
      });
    },
    onError: (error: Error) => {
      const message = error.message.includes("only admin") 
        ? "Tek yönetici olduğunuz için kendi rolünüzü düşüremezsiniz."
        : "Rol güncellenirken bir hata oluştu.";
      toast({
        title: "Hata",
        description: message,
        variant: "destructive",
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/projects/${project.id}/members/${userId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to remove member");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "members"] });
      toast({
        title: "Üye kaldırıldı",
        description: "Proje üyesi başarıyla kaldırıldı.",
      });
    },
    onError: (error: Error) => {
      const message = error.message.includes("only admin") 
        ? "Tek yönetici olduğunuz için kendinizi kaldıramazsınız."
        : "Üye kaldırılırken bir hata oluştu.";
      toast({
        title: "Hata",
        description: message,
        variant: "destructive",
      });
    },
  });

  const getInitials = (user: User | null) => {
    if (!user) return "?";
    const firstName = user.firstName || "";
    const lastName = user.lastName || "";
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || user.email?.charAt(0).toUpperCase() || "?";
  };

  const getDisplayName = (user: User | null) => {
    if (!user) return "Bilinmeyen Kullanıcı";
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }
    return user.email || "Bilinmeyen Kullanıcı";
  };

  const availableUsers = allUsers?.filter(
    (u) => !membersData?.members.find((m) => m.userId === u.id) && u.id !== project.createdBy
  ) || [];

  if (membersLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Proje Ekibi</h2>
          <p className="text-sm text-muted-foreground">
            {(membersData?.members.length || 0) + 1} üye
          </p>
        </div>
        
        {membersData?.isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="button-create-invite">
                  <Link2 className="h-4 w-4 mr-2" />
                  Davet Linki Oluştur
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Davet Linki Oluştur</DialogTitle>
                  <DialogDescription>
                    Kişinin bilgilerini girin ve rol seçin. Oluşturulan linki kopyalayıp paylaşabilirsiniz.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">İsim</label>
                    <Input
                      placeholder="Örn: Ahmet Yılmaz"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      data-testid="input-invite-name"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">E-posta</label>
                    <Input
                      type="email"
                      placeholder="ornek@email.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      data-testid="input-invite-email"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Rol</label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger data-testid="select-invite-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            <span>Yönetici</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="editor">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            <span>Editör</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="viewer">
                          <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4" />
                            <span>Görüntüleyici</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setInviteOpen(false)}>
                    İptal
                  </Button>
                  <Button
                    onClick={() => createInvitationMutation.mutate({ 
                      name: inviteName, 
                      email: inviteEmail, 
                      role: inviteRole 
                    })}
                    disabled={!inviteName || !inviteEmail || createInvitationMutation.isPending}
                    data-testid="button-confirm-create-invite"
                  >
                    {createInvitationMutation.isPending ? "Oluşturuluyor..." : "Oluştur"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            
            <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-member">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Üye Ekle
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Proje Üyesi Ekle</DialogTitle>
                <DialogDescription>
                  Projeye yeni bir üye ekleyin ve rolünü belirleyin.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Kullanıcı</label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger data-testid="select-user">
                      <SelectValue placeholder="Kullanıcı seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {usersLoading ? (
                        <div className="p-2 text-sm text-muted-foreground">Yükleniyor...</div>
                      ) : availableUsers.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground">Eklenecek kullanıcı yok</div>
                      ) : (
                        availableUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={user.profileImageUrl || undefined} />
                                <AvatarFallback className="text-xs">{getInitials(user)}</AvatarFallback>
                              </Avatar>
                              <span>{getDisplayName(user)}</span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Rol</label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger data-testid="select-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          <span>Yönetici</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="editor">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span>Editör</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="viewer">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          <span>Görüntüleyici</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAddMemberOpen(false)}>
                  İptal
                </Button>
                <Button
                  onClick={() => addMemberMutation.mutate({ userId: selectedUserId, role: selectedRole })}
                  disabled={!selectedUserId || addMemberMutation.isPending}
                  data-testid="button-confirm-add-member"
                >
                  {addMemberMutation.isPending ? "Ekleniyor..." : "Ekle"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        )}
      </div>

      {membersData?.isAdmin && invitations && invitations.filter(i => i.status === "pending").length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Bekleyen Davetler
            </CardTitle>
            <CardDescription>
              Henüz kabul edilmemiş davetler
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {invitations.filter(i => i.status === "pending").map((invitation) => {
                const RoleIcon = roleLabels[invitation.role]?.icon || Eye;
                const isExpired = new Date() > new Date(invitation.expiresAt);
                return (
                  <div
                    key={invitation.id}
                    className="flex flex-wrap items-center gap-3 p-3 rounded-md bg-muted/50"
                    data-testid={`invitation-row-${invitation.id}`}
                  >
                    <Avatar>
                      <AvatarFallback>
                        {invitation.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{invitation.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{invitation.email}</p>
                    </div>
                    <Badge variant="outline">
                      <RoleIcon className="h-3 w-3 mr-1" />
                      {roleLabels[invitation.role]?.label || invitation.role}
                    </Badge>
                    {isExpired ? (
                      <Badge variant="destructive">
                        <Clock className="h-3 w-3 mr-1" />
                        Süresi Dolmuş
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyInviteLink(invitation.token)}
                          data-testid={`button-copy-invite-${invitation.id}`}
                        >
                          {copiedToken === invitation.token ? (
                            <>
                              <Check className="h-4 w-4 mr-1" />
                              Kopyalandı
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4 mr-1" />
                              Linki Kopyala
                            </>
                          )}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              data-testid={`button-delete-invite-${invitation.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Daveti Sil</AlertDialogTitle>
                              <AlertDialogDescription>
                                {invitation.name} için oluşturulan daveti silmek istediğinize emin misiniz?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>İptal</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteInvitationMutation.mutate(invitation.id)}
                                className="bg-destructive text-destructive-foreground"
                              >
                                Sil
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Crown className="h-4 w-4 text-yellow-500" />
            Proje Sahibi
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allUsers ? (
            (() => {
              const owner = allUsers.find((u) => u.id === project.createdBy);
              return owner ? (
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={owner.profileImageUrl || undefined} />
                    <AvatarFallback>{getInitials(owner)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium">{getDisplayName(owner)}</p>
                    {owner.email && (
                      <p className="text-sm text-muted-foreground">{owner.email}</p>
                    )}
                  </div>
                  <Badge variant="secondary">
                    <Crown className="h-3 w-3 mr-1" />
                    Sahip
                  </Badge>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Proje sahibi bilgisi yok</p>
              );
            })()
          ) : (
            <Skeleton className="h-12 w-full" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Proje Üyeleri
          </CardTitle>
          <CardDescription>
            Projeye eklenen üyeler ve rolleri
          </CardDescription>
        </CardHeader>
        <CardContent>
          {membersData?.members && membersData.members.length > 0 ? (
            <div className="space-y-3">
              {membersData.members.map((member) => {
                const RoleIcon = roleLabels[member.role]?.icon || Eye;
                return (
                  <div
                    key={member.id}
                    className="flex flex-wrap items-center gap-3 p-3 rounded-md bg-muted/50"
                    data-testid={`member-row-${member.userId}`}
                  >
                    <Avatar>
                      <AvatarImage src={member.user?.profileImageUrl || undefined} />
                      <AvatarFallback>{getInitials(member.user)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{getDisplayName(member.user)}</p>
                      {member.user?.email && (
                        <p className="text-sm text-muted-foreground truncate">{member.user.email}</p>
                      )}
                    </div>
                    
                    {membersData.isAdmin ? (
                      <div className="flex items-center gap-2">
                        <Select
                          value={member.role}
                          onValueChange={(value) =>
                            updateRoleMutation.mutate({ userId: member.userId, role: value })
                          }
                          disabled={updateRoleMutation.isPending}
                        >
                          <SelectTrigger className="w-36" data-testid={`select-role-${member.userId}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">
                              <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4" />
                                <span>Yönetici</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="editor">
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                <span>Editör</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="viewer">
                              <div className="flex items-center gap-2">
                                <Eye className="h-4 w-4" />
                                <span>Görüntüleyici</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              data-testid={`button-remove-${member.userId}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Üyeyi Kaldır</AlertDialogTitle>
                              <AlertDialogDescription>
                                {getDisplayName(member.user)} kullanıcısını projeden kaldırmak istediğinize emin misiniz?
                                Bu işlem geri alınamaz.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>İptal</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => removeMemberMutation.mutate(member.userId)}
                                className="bg-destructive text-destructive-foreground"
                                data-testid={`button-confirm-remove-${member.userId}`}
                              >
                                Kaldır
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ) : (
                      <Badge variant="outline">
                        <RoleIcon className="h-3 w-3 mr-1" />
                        {roleLabels[member.role]?.label || member.role}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Henüz proje üyesi eklenmedi</p>
              {membersData?.isAdmin && (
                <p className="text-sm mt-1">Yukarıdaki "Üye Ekle" butonunu kullanarak üye ekleyebilirsiniz.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rol Açıklamaları</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <Badge variant="secondary" className="mt-0.5">
                <Crown className="h-3 w-3 mr-1" />
                Sahip
              </Badge>
              <p className="text-muted-foreground">Projeyi oluşturan kişi. Tüm yetkilere sahiptir.</p>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="secondary" className="mt-0.5">
                <Shield className="h-3 w-3 mr-1" />
                Yönetici
              </Badge>
              <p className="text-muted-foreground">Proje ayarlarını düzenleyebilir, üye ekleyip kaldırabilir.</p>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="secondary" className="mt-0.5">
                <Users className="h-3 w-3 mr-1" />
                Editör
              </Badge>
              <p className="text-muted-foreground">Veri girişi yapabilir, raporları görüntüleyebilir.</p>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="secondary" className="mt-0.5">
                <Eye className="h-3 w-3 mr-1" />
                Görüntüleyici
              </Badge>
              <p className="text-muted-foreground">Sadece projeyi ve raporları görüntüleyebilir.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
