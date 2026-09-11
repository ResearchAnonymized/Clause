import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";
import { NotificationsBell } from "@/components/notifications-bell";
import { PRODUCT_NAME } from "@/config/instance";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ProductTourProvider, ProductTourStartButton } from "@/components/product-tour";

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <SidebarProvider>
      <ProductTourProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b bg-card/90 backdrop-blur-md px-4 gap-4 sticky top-0 z-30">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger />
              <div className="hidden md:flex items-center gap-2 min-w-0">
                <span className="text-sm font-sans font-semibold text-foreground tracking-tight">{PRODUCT_NAME}</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-sm text-muted-foreground truncate">{t("shell.tagline")}</span>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <LanguageSwitcher />
              <ThemeToggle />
              <ProductTourStartButton variant="ghost" size="icon" className="h-9 w-9" />
              <NotificationsBell />
              <div className="w-px h-5 bg-border mx-1.5" />
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 overflow-x-hidden app-main-surface">{children}</main>
        </div>
      </div>
      </ProductTourProvider>
    </SidebarProvider>
  );
}
