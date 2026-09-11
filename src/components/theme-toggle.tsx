import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import { useTranslation } from "react-i18next";

export function ThemeToggle({ inverted = false }: { inverted?: boolean }) {
  const { theme, setTheme, resolved } = useTheme();
  const { t } = useTranslation();
  const Icon = theme === "system" ? Monitor : resolved === "dark" ? Moon : Sun;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("common.theme")}
          className={inverted ? "text-white hover:bg-white/10 hover:text-white" : undefined}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-36 z-[80] bg-card text-card-foreground border-border shadow-lg"
        data-testid="theme-menu"
      >
        <DropdownMenuItem data-testid="theme-light" onClick={() => setTheme("light")}>
          <Sun className="h-4 w-4 mr-2" /> {t("common.light")}
          {theme === "light" && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="theme-dark" onClick={() => setTheme("dark")}>
          <Moon className="h-4 w-4 mr-2" /> {t("common.dark")}
          {theme === "dark" && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="theme-system" onClick={() => setTheme("system")}>
          <Monitor className="h-4 w-4 mr-2" /> {t("common.system")}
          {theme === "system" && <span className="ml-auto text-xs">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
