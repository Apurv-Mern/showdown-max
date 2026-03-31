'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/shared/Button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { Modal } from '@/components/shared/Modal';

interface Team {
  id: number;
  teamName: string;
  score: number;
  isConnected: boolean;
  isEliminated: boolean;
}

interface Session {
  id: number;
  pin: string;
  status: string;
}

export default function TeamManagerPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamsLoading, setTeamsLoading] = useState(false);

  // Add Team modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamScore, setNewTeamScore] = useState(0);
  const [adding, setAdding] = useState(false);

  // Edit Score modal
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editScore, setEditScore] = useState(0);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await api.get<{ sessions: Session[]; total: number }>('/api/sessions');
      setSessions(res.data.sessions);
      if (!selectedSessionId && res.data.sessions.length > 0) {
        const active = res.data.sessions.find((s) => s.status === 'active');
        setSelectedSessionId(active?.id ?? res.data.sessions[0].id);
      }
    } catch {
      console.error('Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  }, [selectedSessionId]);

  const fetchTeams = useCallback(async (sessionId: number) => {
    try {
      setTeamsLoading(true);
      const res = await api.get<Team[]>(`/api/teams/session/${sessionId}`);
      setTeams(res.data);
    } catch {
      console.error('Failed to fetch teams');
    } finally {
      setTeamsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (selectedSessionId) {
      fetchTeams(selectedSessionId);
    }
  }, [selectedSessionId, fetchTeams]);

  const handleAddTeam = async () => {
    if (!newTeamName.trim() || !selectedSessionId) return;
    try {
      setAdding(true);
      await api.post('/api/teams', {
        sessionId: selectedSessionId,
        teamName: newTeamName.trim(),
        score: newTeamScore,
      });
      setShowAddModal(false);
      setNewTeamName('');
      setNewTeamScore(0);
      fetchTeams(selectedSessionId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add team';
      alert(message);
    } finally {
      setAdding(false);
    }
  };

  const handleEditScore = async () => {
    if (!editingTeam || !selectedSessionId) return;
    try {
      setSaving(true);
      await api.put(`/api/teams/${editingTeam.id}/score`, { score: editScore });
      setEditingTeam(null);
      fetchTeams(selectedSessionId);
    } catch {
      alert('Failed to update score');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (teamId: number) => {
    if (!selectedSessionId) return;
    try {
      setDeletingId(teamId);
      await api.delete(`/api/teams/${teamId}`);
      fetchTeams(selectedSessionId);
    } catch {
      alert('Failed to remove team');
    } finally {
      setDeletingId(null);
    }
  };

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-[30px] font-medium leading-9 text-white">Team Manager</h1>
        <div className="flex items-center gap-4">
          {/* Session Selector */}
          <select
            value={selectedSessionId ?? ''}
            onChange={(e) => setSelectedSessionId(e.target.value ? Number(e.target.value) : null)}
            className="h-[38px] rounded-[10px] border border-[rgba(0,217,255,0.3)] bg-[#1a1f35] px-4 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-[rgba(0,217,255,0.5)]"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                Session #{s.pin}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex h-12 items-center gap-2 rounded-[14px] bg-[#2e354c] px-5 text-base font-medium text-white transition-colors hover:bg-[#3a4260]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Team
          </button>
        </div>
      </div>

      {/* Teams Table */}
      <div
        className="overflow-hidden rounded-2xl border-2 border-[rgba(0,217,255,0.3)]"
        style={{
          backgroundImage:
            'linear-gradient(161deg, #1a1f35 0%, #191e32 12.5%, #171c30 25%, #161b2d 37.5%, #14192a 50%, #131828 62.5%, #121725 75%, #101523 87.5%, #0f1420 100%)',
        }}
      >
        {teamsLoading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        ) : teams.length === 0 ? (
          <div className="py-20 text-center text-foreground/50">
            <p className="mb-2 text-lg">No teams in this session</p>
            <p className="text-sm">Teams will appear here when they join the session.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[rgba(0,217,255,0.3)] bg-[#252b45]">
                <th className="px-6 py-4 text-left text-sm font-bold text-white">Team Name</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-white">Score</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-white">Status</th>
                <th className="px-6 py-4 text-left text-sm font-bold text-white">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr key={team.id} className="border-b border-[rgba(0,217,255,0.1)]">
                  <td className="px-6 py-5 text-base text-white">{team.teamName}</td>
                  <td className="px-6 py-5 text-base text-[#00d9ff]">{team.score} Points</td>
                  <td className="px-6 py-5">
                    {team.isConnected ? (
                      <span className="inline-flex rounded-full bg-[rgba(0,201,80,0.2)] px-3 py-1 text-xs text-[#05df72]">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-[rgba(106,114,130,0.2)] px-3 py-1 text-xs text-[#99a1af]">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => {
                          setEditingTeam(team);
                          setEditScore(team.score);
                        }}
                        className="rounded-[10px] border border-[rgba(0,217,255,0.6)] bg-[#252b45] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2e354c]"
                      >
                        Edit Score
                      </button>
                      <button
                        onClick={() => handleDelete(team.id)}
                        disabled={deletingId === team.id}
                        className="flex items-center justify-center rounded-[10px] border border-[rgba(255,0,0,0.6)] bg-[#252b45] p-2 text-red-400 transition-colors hover:bg-red-900/30 disabled:opacity-50"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Team Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Team">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground/70">Team Name *</label>
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Enter team name"
              maxLength={50}
              className="w-full rounded-lg border border-border bg-surface-light px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground/70">Starting Score</label>
            <input
              type="number"
              value={newTeamScore}
              onChange={(e) => setNewTeamScore(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-surface-light px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={handleAddTeam} disabled={!newTeamName.trim() || adding}>
              {adding ? 'Adding...' : 'Add Team'}
            </Button>
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Score Modal */}
      <Modal
        isOpen={editingTeam !== null}
        onClose={() => setEditingTeam(null)}
        title={`Edit Score — ${editingTeam?.teamName}`}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground/70">Score</label>
            <input
              type="number"
              value={editScore}
              onChange={(e) => setEditScore(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-surface-light px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={handleEditScore} disabled={saving}>
              {saving ? 'Saving...' : 'Save Score'}
            </Button>
            <Button variant="secondary" onClick={() => setEditingTeam(null)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
