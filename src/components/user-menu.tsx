import { useNavigate } from "@tanstack/react-router";
import { BookOpen, LogOut, Map, User as UserIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useRoles } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useProductTourOptional } from "@/components/product-tour";


export function UserMenu() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { roles } = useRoles(user?.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const tour = useProductTourOptional();
  if (!user) return null;
  const initials = (user.email ?? "?").slice(0, 2).toUpperCase();
  const topRoleKey = roles.includes("admin") ? "roleAdmin" : roles.includes("reviewer") ? "roleReviewer" : "roleViewer";


  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 h-9">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs bg-brand text-brand-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="hidden sm:flex flex-col items-start leading-tight">
            <span className="text-xs font-medium">{user.email}</span>
            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
              {t(`userMenu.${topRoleKey}`)}
            </Badge>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
          <UserIcon className="w-4 h-4 mr-2" /> {t("userMenu.profile")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => tour?.start(0)}>
          <Map className="w-4 h-4 mr-2" /> {t("productTour.start")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate({ to: "/settings/help" })}>
          <BookOpen className="w-4 h-4 mr-2" /> {t("sidebar.help")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="text-destructive">
          <LogOut className="w-4 h-4 mr-2" /> {t("userMenu.signOut")}
        </DropdownMenuItem>

      </DropdownMenuContent>
    </DropdownMenu>
  );
}
