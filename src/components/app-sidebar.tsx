import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  FileSearch,
  BookMarked,
  Bot,
  Settings,
  Map,
  Plus,
  Inbox,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { useProductTourOptional } from "@/components/product-tour";
import { PRODUCT_TOUR_STEPS } from "@/lib/product-tour";
import { cn } from "@/lib/utils";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/config/instance";
import { CounterpartGlyph } from "@/components/product-mark";
import { useAuth, useRoles } from "@/hooks/use-auth";

const itemsDef = [
  { key: "dashboard", url: "/dashboard", icon: LayoutDashboard },
  { key: "analyses", url: "/runs", icon: FileSearch },
  { key: "criteria", url: "/criteria", icon: BookMarked },
  { key: "agents", url: "/agents", icon: Bot },
  { key: "settings", url: "/settings", icon: Settings },
] as const;

export function AppSidebar() {
  const { t } = useTranslation();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tour = useProductTourOptional();
  const { user } = useAuth();
  const { isAdmin } = useRoles(user?.id);
  const { data: joinRequests = [] } = useQuery({
    queryKey: ["admin", "access-requests"],
    enabled: isAdmin,
    queryFn: async () => {
      const { listAccessRequests } = await import("@/lib/access-requests.functions");
      return listAccessRequests();
    },
  });
  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border/80">
        <Link to="/dashboard" className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-sidebar-accent/50 transition-colors">
          <CounterpartGlyph inverted className="shadow-sm" />
          {!collapsed && (
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-sans font-semibold text-sidebar-foreground tracking-tight">{PRODUCT_NAME}</span>
              <span className="text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/45">
                {t("sidebar.tagline")}
              </span>
            </div>
          )}
        </Link>
        <div className="mt-1.5 border-t border-sidebar-border/70 pt-2">
          <WorkspaceSwitcher collapsed={collapsed} />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className="pt-3">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "h-10 bg-sidebar-primary text-sidebar-primary-foreground",
                    "hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground",
                    "shadow-sm font-medium",
                    tour?.active && PRODUCT_TOUR_STEPS[tour.stepIndex]?.id === "newAnalysis" && "ring-2 ring-white shadow-[0_0_0_4px_rgba(255,255,255,0.2)]",
                  )}
                >
                  <Link to="/runs/new" data-tour="newAnalysis">
                    <Plus className="h-4 w-4" />
                    {!collapsed && <span>{t("sidebar.newAnalysis")}</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40">
            {t("sidebar.workspace")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {itemsDef.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    className={cn(
                      "data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium",
                      tour?.active && tourStepMatches(item.key, tour.stepIndex) && "ring-2 ring-white/90 shadow-[0_0_0_4px_rgba(255,255,255,0.18)]",
                    )}
                  >
                    <Link to={item.url} data-tour={item.key}>
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{t(`sidebar.${item.key}`)}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/admin")}>
                    <Link to="/admin">
                      <Inbox className="h-4 w-4" />
                      {!collapsed && <span>{t("sidebar.requests")}</span>}
                    </Link>
                  </SidebarMenuButton>
                  {joinRequests.length > 0 ? (
                    <SidebarMenuBadge>{joinRequests.length}</SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/80">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              type="button"
              onClick={() => tour?.start(0)}
              tooltip={t("sidebar.tour")}
              aria-label={t("sidebar.tour")}
            >
              <Map className="h-4 w-4" />
              {!collapsed && <span>{t("sidebar.tour")}</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {!collapsed && (
          <div className="px-2.5 py-2 text-[11px] leading-relaxed text-sidebar-foreground/40">
            <div className="font-medium text-sidebar-foreground/55">{PRODUCT_NAME}</div>
            {PRODUCT_TAGLINE}
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

function tourStepMatches(navKey: string, stepIndex: number) {
  const id = PRODUCT_TOUR_STEPS[stepIndex]?.id;
  if (navKey === "dashboard") return id === "dashboard";
  if (navKey === "analyses") return id === "analyses";
  if (navKey === "criteria") return id === "criteria";
  if (navKey === "agents") return id === "agents";
  if (navKey === "settings") return id === "settings" || id === "help";
  return false;
}
