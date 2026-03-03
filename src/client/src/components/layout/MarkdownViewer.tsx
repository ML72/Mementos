import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Box } from '@mui/material';
import 'katex/dist/katex.min.css';

interface MarkdownViewerProps {
  content: string;
}

const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ content }) => {
  return (
    <Box sx={{ 
      fontFamily: (theme) => theme.typography.fontFamily,
      fontSize: '1rem',
      color: 'inherit',
      '& p': { margin: '0 0 16px 0', lineHeight: 1.6 },
      '& a': { color: '#2563EB', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
      '& ul, & ol': { margin: '0 0 16px 0', paddingLeft: '24px' },
      '& blockquote': { borderLeft: '4px solid #E5E7EB', margin: '0 0 16px 0', padding: '8px 16px', color: '#6B7280', fontStyle: 'italic' },
      '& code': { fontFamily: 'monospace', backgroundColor: '#F3F4F6', padding: '2px 4px', borderRadius: '4px', fontSize: '0.875em' },
      '& pre': { backgroundColor: '#F3F4F6', padding: '16px', borderRadius: '8px', overflowX: 'auto', '& code': { backgroundColor: 'transparent', padding: 0 } },
      '& h1, & h2, & h3, & h4, & h5, & h6': { margin: '24px 0 16px 0', fontWeight: 600, lineHeight: 1.25 },
      overflowWrap: 'break-word',
      wordBreak: 'break-word',
    }}>
      <ReactMarkdown 
        remarkPlugins={[remarkMath]} 
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </Box>
  );
};

export default MarkdownViewer;
