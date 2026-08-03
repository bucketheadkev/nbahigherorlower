'use client';

import { motion } from 'framer-motion';
import { TEAMS } from '@/lib/tradeup/teams';
import { getTeamColors } from '@/lib/tradeup/teamColors';

export function HomeTeamGrid() {
  return (
    <div className="home-panel home-teams-panel">
      <div className="home-panel-header">
        <span className="home-panel-label">All 30 front offices</span>
        <span className="home-panel-meta">Every team wants something different</span>
      </div>
      <div className="home-team-grid">
        {TEAMS.map((team, i) => {
          const colors = getTeamColors(team.id);
          return (
            <motion.div
              key={team.id}
              className="home-team-tile"
              title={team.fullName}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.02 * (i % 15), duration: 0.25 }}
              style={
                {
                  '--tile-primary': colors.primary,
                  '--tile-accent': colors.accent,
                } as React.CSSProperties
              }
            >
              <span className="home-team-tile-abbr">{team.id}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
