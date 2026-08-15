import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  FileSearch,
  BookMarked,
  Bot,
  Settings,
  Plus,
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
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { cn } from "@/lib/utils";

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
  const isActive = (p: string) => pathname === p || pathname.startsWith(p + "/");

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border/80">
        <Link to="/dashboard" className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-sidebar-accent/50 transition-colors">
          <div className="w-8 h-8 rounded-md bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center font-bold shrink-0 shadow-sm">
            C
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-semibold text-sidebar-foreground tracking-tight">Clause</span>
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
                  )}
                >
                  <Link to="/runs/new">
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
                    className="data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium"
                  >
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{t(`sidebar.${item.key}`)}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/80">
        {!collapsed && (
          <div className="px-2.5 py-2.5 text-[11px] leading-relaxed text-sidebar-foreground/40">
            <div className="font-medium text-sidebar-foreground/55">Clause</div>
            Multi-agent tender review
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
