'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';
import { Button } from '@/components/shared/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Modal } from '@/components/shared/Modal';
import { useAuth } from '@/lib/auth';

interface Team {
  teamId: number;
  teamName: string;
  score: number;
  isEliminated?: boolean;
  isConnected?: boolean;
}

function HostTeamsContent() {
  const searchParams = useSearchParams();
  const { assignedSession } = useAuth();
  const pin = assignedSession?.pin || searchParams.get('pin') || '';

  const { socket, isConnected } = useSocket();
  const [teams, setTeams] = useState<Team[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<Team | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamScore, setNewTeamScore] = useState(0);
  const [editScore, setEditScore] = useState(0);

  useEffect(() => {
    if (!socket || !pin) return;

    socket.emit('host_connect', { pin });

    socket.on('session_state', (data: any) => {
      if (data.teams) {
        const teamList = typeof data.teams === 'object' && !Array.isArray(data.teams)
          ? Object.values(data.teams) as Team[]
          : data.teams as Team[];
        setTeams(teamList.sort((a, b) => b.score - a.score));
      }
    });

    socket.on('team_joined', (team: Team) => {
      setTeams((prev) => [...prev.filter((t) => t.teamId !== team.teamId), team].sort((a, b) => b.score - a.score));
    });

    socket.on('team_removed', ({ teamId }: { teamId: number }) => {
      setTeams((prev) => prev.filter((t) => t.teamId !== teamId));
    });

    socket.on('team_updated', ({ teamId, score }: { teamId: number; score: number }) => {
      setTeams((prev) =>
        prev.map((t) => (t.teamId === teamId ? { ...t, score } : t)).sort((a, b) => b.score - a.score),
      );
    });

    socket.on('scoreboard', (data: { teams: Team[] }) => {
      setTeams(data.teams.sort((a, b) => b.score - a.score));
    });

    return () => {
      socket.off('session_state');
      socket.off('team_joined');
      socket.off('team_removed');
      socket.off('team_updated');
      socket.off('scoreboard');
    };
  }, [socket, pin]);

  const handleAddTeam = () => {
    if (!socket || !newTeamName.trim()) return;
    socket.emit('add_team', { pin, teamName: newTeamName.trim(), score: newTeamScore });
    setShowAddModal(false);
    setNewTeamName('');
    setNewTeamScore(0);
  };

  const handleRemoveTeam = (teamId: number) => {
    if (!socket || !confirm('Remove this team?')) return;
    socket.emit('remove_team', { pin, teamId });
  };

  const handleEditScore = () => {
    if (!socket || !showEditModal) return;
    socket.emit('edit_team_score', { pin, teamId: showEditModal.teamId, score: editScore });
    setShowEditModal(null);
  };

  if (!pin) {
    return (
      <div className="text-center py-16 text-foreground/50">
        <p>No session PIN. Go to Sessions to select one.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Team Management</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="font-mono text-primary font-bold">{pin}</span>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-success' : 'bg-danger'}`} />
            <span className="text-foreground/40 text-sm">{teams.length} team{teams.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <Button onClick={() => setShowAddModal(true)}>+ Add Team</Button>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-16 text-foreground/50 bg-surface border border-border rounded-xl">
          <p className="text-lg mb-2">No teams yet</p>
          <p className="text-sm">Teams will appear here as they join, or add them manually.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {teams.map((team, idx) => (
            <div
              key={team.teamId}
              className="bg-surface border border-border rounded-xl px-5 py-4 flex items-center justify-between hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center gap-4">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  idx === 0 ? 'bg-warning/20 text-warning' : idx === 1 ? 'bg-foreground/10 text-foreground/50' : idx === 2 ? 'bg-orange-500/20 text-orange-400' : 'bg-surface-light text-foreground/30'
                }`}>
                  {idx + 1}
                </span>
                <div>
                  <span className={`font-medium ${team.isEliminated ? 'line-through text-foreground/30' : ''}`}>
                    {team.teamName}
                  </span>
                  <div className="flex gap-2 mt-0.5">
                    {team.isEliminated && <span className="text-xs text-danger">Eliminated</span>}
                    {team.isConnected === false && <span className="text-xs text-warning">Disconnected</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono text-xl font-bold text-primary">{team.score}</span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setShowEditModal(team); setEditScore(team.score); }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveTeam(team.teamId)}
                    className="text-danger/60 hover:text-danger"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Team Manually">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">Team Name *</label>
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Enter team name"
              className="w-full bg-surface-light border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">Starting Score</label>
            <input
              type="number"
              value={newTeamScore}
              onChange={(e) => setNewTeamScore(Number(e.target.value))}
              className="w-full bg-surface-light border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={handleAddTeam} disabled={!newTeamName.trim()}>Add Team</Button>
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showEditModal !== null} onClose={() => setShowEditModal(null)} title={`Edit Score: ${showEditModal?.teamName}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">New Score</label>
            <input
              type="number"
              value={editScore}
              onChange={(e) => setEditScore(Number(e.target.value))}
              className="w-full bg-surface-light border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={handleEditScore}>Save Score</Button>
            <Button variant="secondary" onClick={() => setShowEditModal(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function HostTeamsPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <HostTeamsContent />
    </Suspense>
  );
}
