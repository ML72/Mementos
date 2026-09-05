import React from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';

interface LikeButtonProps {
  liked: boolean;
  count?: number;
  onToggle?: () => void;
  // Read-only mode: shows the heart + count without interactivity (e.g. on your own notes).
  readOnly?: boolean;
}

const LikeButton: React.FC<LikeButtonProps> = ({ liked, count, onToggle, readOnly = false }) => {
  const color = liked ? '#EF4444' : '#9CA3AF';
  const icon = liked ? <FavoriteIcon fontSize="small" /> : <FavoriteBorderIcon fontSize="small" />;
  const countLabel = typeof count === 'number' ? (
    <Typography variant="body2" sx={{ color: liked ? '#EF4444' : '#6B7280', fontWeight: 600, ml: 0.25, minWidth: 14 }}>
      {count}
    </Typography>
  ) : null;

  if (readOnly) {
    const n = count ?? 0;
    return (
      <Tooltip title={`${n} like${n === 1 ? '' : 's'}`}>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', color, px: 0.5 }}>
          {icon}
          {countLabel}
        </Box>
      </Tooltip>
    );
  }

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
      <Tooltip title={liked ? 'Unlike' : 'Like'}>
        <IconButton
          onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
          size="small"
          aria-label={liked ? 'Unlike note' : 'Like note'}
          sx={{
            color,
            '&:hover': {
              color: liked ? '#DC2626' : '#EF4444',
              backgroundColor: 'rgba(239, 68, 68, 0.06)'
            }
          }}
        >
          {icon}
        </IconButton>
      </Tooltip>
      {countLabel}
    </Box>
  );
};

export default LikeButton;
