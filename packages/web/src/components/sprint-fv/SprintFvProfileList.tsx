import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSprintFvProfiles, useDeleteSprintFvProfile, type SprintFvProfile } from '@/lib/sprint-fv-api';
import { useLocation } from 'wouter';
import { useUnitSystem } from '@/contexts/UnitSystemContext';

interface Props {
  userId: string;
}

const classificationBadge: Record<string, { variant: 'default' | 'secondary' | 'destructive'; label: string }> = {
  'force-deficit': { variant: 'secondary', label: 'Force Deficit' },
  'velocity-deficit': { variant: 'default', label: 'Velocity Deficit' },
  'well-balanced': { variant: 'default', label: 'Well Balanced' },
};

export function SprintFvProfileList({ userId }: Props) {
  const { data, isLoading } = useSprintFvProfiles(userId);
  const deleteMutation = useDeleteSprintFvProfile();
  const [, navigate] = useLocation();
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const units = useUnitSystem();

  const profiles = useMemo(() => {
    if (!data?.profiles) return [];
    const sorted = [...data.profiles];
    sorted.sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [data?.profiles, sortDir]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No profiles generated yet. Use the Generate tab to create F-V profiles.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              className="cursor-pointer"
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            >
              Date {sortDir === 'desc' ? '↓' : '↑'}
            </TableHead>
            <TableHead>Classification</TableHead>
            <TableHead className="text-right">F0 ({units.forceRelUnit})</TableHead>
            <TableHead className="text-right">V0 ({units.velUnit})</TableHead>
            <TableHead className="text-right">Pmax ({units.powerRelUnit})</TableHead>
            <TableHead className="text-right">R²</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {profiles.map((p) => {
            const cls = p.analysisJson?.classification.classification;
            const badge = cls ? classificationBadge[cls] : null;

            return (
              <TableRow
                key={p.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => navigate(`/sprint-fv/${p.id}`)}
              >
                <TableCell className="font-medium">{p.date}</TableCell>
                <TableCell>
                  {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
                </TableCell>
                <TableCell className="text-right">{p.f0Rel ? parseFloat(p.f0Rel).toFixed(2) : '—'}</TableCell>
                <TableCell className="text-right">{p.v0 ? units.vel(parseFloat(p.v0)).toFixed(2) : '—'}</TableCell>
                <TableCell className="text-right">{p.pmaxRel ? parseFloat(p.pmaxRel).toFixed(2) : '—'}</TableCell>
                <TableCell className="text-right">{p.fitR2 ? parseFloat(p.fitR2).toFixed(4) : '—'}</TableCell>
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={deleteMutation.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Delete this profile?')) {
                        deleteMutation.mutate(p.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
