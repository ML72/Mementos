import React from 'react';
import { Box, CircularProgress, Fade } from '@mui/material';

/**
 * Shown while a page downloads: the first time it's opened, or while a redirect waits for it. The
 * spinner fades in only after a moment, so a page that arrives quickly doesn't flash it.
 */
const PageLoading: React.FC = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', pt: '30vh' }}>
    <Fade in style={{ transitionDelay: '400ms' }}>
      <CircularProgress aria-label="Loading" />
    </Fade>
  </Box>
);

export default PageLoading;
