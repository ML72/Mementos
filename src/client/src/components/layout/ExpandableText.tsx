import React, { useState } from 'react';
import { Box, Button } from '@mui/material';
import MarkdownViewer from './MarkdownViewer';

interface ExpandableTextProps {
  text: string;
  maxLength?: number;
}

const ExpandableText: React.FC<ExpandableTextProps> = ({ text, maxLength = 250 }) => {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  const isLong = text.length > maxLength;

  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ 
        color: '#4B5563', 
        lineHeight: 1.7,
        ...( !expanded && isLong ? {
          display: '-webkit-box',
          WebkitLineClamp: 4,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        } : {})
      }}>
        <MarkdownViewer content={text} />
      </Box>
      {isLong && (
        <Button 
          onClick={() => setExpanded(!expanded)} 
          sx={{ 
            mt: 1, 
            textTransform: 'none', 
            fontWeight: 600, 
            p: 0, 
            minWidth: 'auto',
            '&:hover': { background: 'transparent', textDecoration: 'underline' } 
          }}
          disableRipple
        >
          {expanded ? 'Show less' : 'Expand'}
        </Button>
      )}
    </Box>
  );
};

export default ExpandableText;
