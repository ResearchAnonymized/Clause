import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SUPPORTED_LANGS } from "@/lib/i18n";

export function LanguageSwitcher({ compact = false, inverted = false }: { compact?: boolean; inverted?: boolean }) {
  const { i18n, t } = useTranslation();
  const current = SUPPORTED_LANGS.find((l) => i18n.language?.startsWith(l.code)) ?? SUPPORTED_LANGS[0];
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "icon" : "sm"}
          aria-label={t("common.language")}
          className={inverted ? "gap-2 text-white hover:bg-white/10 hover:text-white" : "gap-2"}
        >
          {compact ? <Languages className="h-4 w-4" /> : (<><span>{current.flag}</span><span className="text-xs uppercase">{current.code}</span></>)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40 z-[80] bg-card text-card-foreground border-border shadow-lg">
        {SUPPORTED_LANGS.map((l) => (
          <DropdownMenuItem key={l.code} onClick={() => i18n.changeLanguage(l.code)}>
            <span className="mr-2">{l.flag}</span> {l.label}
            {current.code === l.code && <span className="ml-auto text-xs">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
