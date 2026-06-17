import React, { useState, useRef, useCallback, useLayoutEffect } from 'react';
import { Box, Button } from '@mui/material';
import MarkdownViewer from './MarkdownViewer';

interface ExpandableTextProps {
  text: string;
  // Accepted for backward compatibility but no longer used: truncation is line-based, and the
  // toggle is shown based on actual overflow rather than a character count (which disagreed with
  // the visual clamp and made "Expand" appear on notes that had nothing to expand).
  maxLength?: number;
  maxLines?: number;
}

const ExpandableText: React.FC<ExpandableTextProps> = ({ text, maxLines = 4 }) => {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const measure = useCallback(() => {
    const el = contentRef.current;
    // Only meaningful while collapsed (clamped); once expanded the clamp is removed.
    if (!el || expanded) return;
    // The clamped box overflows only when the full content is taller than what's shown.
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [expanded]);

  useLayoutEffect(() => {
    measure();
    const el = contentRef.current;
    let observer: ResizeObserver | undefined;
    if (el && typeof ResizeObserver !== 'undefined') {
      // Re-check when the container resizes (responsive layouts reflow the text).
      observer = new ResizeObserver(measure);
      observer.observe(el);
    }
    // Re-check once web fonts settle, since glyph metrics can change line wrapping.
    if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
      (document as any).fonts.ready.then(() => measure());
    }
    return () => observer?.disconnect();
  }, [measure, text]);

  if (!text) return null;

  return (
    <Box sx={{ mb: 3 }}>
      <Box
        ref={contentRef}
        sx={{
          color: '#4B5563',
          lineHeight: 1.7,
          ...(!expanded ? {
            display: '-webkit-box',
            WebkitLineClamp: maxLines,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          } : {})
        }}
      >
        <MarkdownViewer content={text} />
      </Box>
      {overflowing && (
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
