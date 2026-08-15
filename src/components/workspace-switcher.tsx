import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import {
  useWorkspaces,
  useSwitchWorkspace,
  useOrganizations,
  useSwitchOrganization,
} from "@/hooks/use-workspace";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

export function WorkspaceSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { data, isLoading } = useWorkspaces();
  const { data: orgs } = useOrganizations();
  const switchWs = useSwitchWorkspace();
  const switchOrg = useSwitchOrganization();
  const current = data?.current;
  const memberships = data?.memberships ?? [];
  const organizations = orgs?.organizations ?? [];
  const currentOrgId = orgs?.currentOrganizationId ?? data?.organizationId;

  if (isLoading || !current) {
    return (
      <div className="px-2 py-1.5 text-xs text-sidebar-foreground/50">
        {collapsed ? <Building2 className="h-4 w-4" /> : "Loading…"}
      </div>
    );
  }

  const currentOrg = organizations.find((o) => o.id === currentOrgId);

  const handleSwitchOrg = async (id: string) => {
    try {
      await switchOrg(id);
      toast.success("Organization switched");
    } catch (e: any) {
      toast.error(e.message ?? "Could not switch organization");
    }
  };

  const handleSwitch = async (id: string) => {
    try {
      await switchWs(id);
      toast.success("Workspace switched");
    } catch (e: any) {
      toast.error(e.message ?? "Could not switch workspace");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between px-2 h-auto py-1.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <div className="min-w-0 text-left">
                <div className="text-xs text-sidebar-foreground/60 truncate">
                  {currentOrg?.name ?? "Organization"}
                </div>
                <div className="text-sm font-medium truncate">{current.workspace.name}</div>
              </div>
            )}
          </div>
          {!collapsed && <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {organizations.length > 0 && (
          <>
            <DropdownMenuLabel>Organizations</DropdownMenuLabel>
            {organizations.map((o) => (
              <DropdownMenuItem key={o.id} onClick={() => handleSwitchOrg(o.id)}>
                <Check
                  className={`mr-2 h-4 w-4 ${o.id === currentOrgId ? "opacity-100" : "opacity-0"}`}
                />
                <span className="truncate">{o.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground uppercase">
                  {o.role}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem key={m.workspace_id} onClick={() => handleSwitch(m.workspace_id)}>
            <Check
              className={`mr-2 h-4 w-4 ${
                m.workspace_id === current.workspace_id ? "opacity-100" : "opacity-0"
              }`}
            />
            <span className="truncate">{m.workspace.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings/organization">Organization settings</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings/workspace">Workspace settings</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
