import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Shield, Lock, Eye, Edit, Trash2, Plus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

interface RLSPolicy {
  table_name: string;
  policy_name: string;
  command: string;
  using_expression: string;
  with_check_expression: string | null;
}

interface UserRLSPoliciesProps {
  userRole: string;
  userId?: string;
}

const commandIcons = {
  SELECT: Eye,
  INSERT: Plus,
  UPDATE: Edit,
  DELETE: Trash2,
  ALL: Shield,
};

const commandColors = {
  SELECT: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  INSERT: "bg-green-500/10 text-green-700 dark:text-green-400",
  UPDATE: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  DELETE: "bg-red-500/10 text-red-700 dark:text-red-400",
  ALL: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
};

export const UserRLSPolicies = ({ userRole, userId }: UserRLSPoliciesProps) => {
  const [policies, setPolicies] = useState<RLSPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupedPolicies, setGroupedPolicies] = useState<Record<string, RLSPolicy[]>>({});

  useEffect(() => {
    fetchRLSPolicies();
  }, [userRole]);

  const fetchRLSPolicies = async () => {
    try {
      setLoading(true);
      
      // Fetch RLS policies using the database function
      const { data, error } = await supabase.rpc('get_rls_policies_for_role', {
        role_name: userRole
      });

      if (error) {
        console.error('Error fetching RLS policies:', error);
        setPolicies([]);
        setGroupedPolicies({});
      } else {
        const policiesList = data || [];
        setPolicies(policiesList);
        groupPoliciesByTable(policiesList);
      }
    } catch (err) {
      console.error('Error fetching RLS policies:', err);
      setPolicies([]);
      setGroupedPolicies({});
    } finally {
      setLoading(false);
    }
  };

  const groupPoliciesByTable = (policiesList: RLSPolicy[]) => {
    const grouped = policiesList.reduce((acc, policy) => {
      if (!acc[policy.table_name]) {
        acc[policy.table_name] = [];
      }
      acc[policy.table_name].push(policy);
      return acc;
    }, {} as Record<string, RLSPolicy[]>);
    
    setGroupedPolicies(grouped);
  };

  const getCommandIcon = (cmd: string) => {
    const Icon = commandIcons[cmd as keyof typeof commandIcons] || Shield;
    return Icon;
  };

  const getCommandColor = (cmd: string) => {
    return commandColors[cmd as keyof typeof commandColors] || commandColors.ALL;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Row-Level Security Policies
          </CardTitle>
          <CardDescription>Loading policies...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Row-Level Security Policies
        </CardTitle>
        <CardDescription>
          Policies that apply to this user's role: <Badge variant="secondary" className="ml-2">{userRole}</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {Object.keys(groupedPolicies).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No specific RLS policies found for this role
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {Object.entries(groupedPolicies).map(([tableName, tablePolicies]) => (
                <Collapsible key={tableName} className="border rounded-lg">
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold text-sm">{tableName}</span>
                      <Badge variant="outline" className="ml-2">
                        {tablePolicies.length} {tablePolicies.length === 1 ? 'policy' : 'policies'}
                      </Badge>
                    </div>
                    <ChevronDown className="h-4 w-4 transition-transform" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 pt-0 space-y-3">
                      {tablePolicies.map((policy, idx) => {
                        const Icon = getCommandIcon(policy.command);
                        const colorClass = getCommandColor(policy.command);
                        
                        return (
                          <div key={idx} className="border rounded-md p-3 bg-muted/30 space-y-2">
                            <div className="flex items-start gap-2">
                              <div className={`p-1.5 rounded ${colorClass}`}>
                                <Icon className="h-3.5 w-3.5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge className={colorClass}>
                                    {policy.command}
                                  </Badge>
                                  <span className="text-sm font-medium truncate">
                                    {policy.policy_name}
                                  </span>
                                </div>
                                
                                {policy.using_expression && (
                                  <div className="mt-2">
                                    <p className="text-xs font-semibold text-muted-foreground mb-1">
                                      USING Expression:
                                    </p>
                                    <code className="text-xs bg-background p-2 rounded block overflow-x-auto">
                                      {policy.using_expression}
                                    </code>
                                  </div>
                                )}
                                
                                {policy.with_check_expression && (
                                  <div className="mt-2">
                                    <p className="text-xs font-semibold text-muted-foreground mb-1">
                                      WITH CHECK Expression:
                                    </p>
                                    <code className="text-xs bg-background p-2 rounded block overflow-x-auto">
                                      {policy.with_check_expression}
                                    </code>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
