import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

/** Language + theme on public pages (auth, legal, verify). */
export function PublicControls({ inverted = false }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      <LanguageSwitcher compact inverted={inverted} />
      <ThemeToggle inverted={inverted} />
    </div>
  );
}
