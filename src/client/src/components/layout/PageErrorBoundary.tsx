import React from 'react';
import { useLocation } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';
import { PageLoadError } from '../../service/lazy_page';

interface BoundaryProps {
  resetKey: string;
  children: React.ReactNode;
}

interface BoundaryState {
  failed: boolean;
  didNotLoad: boolean;
}

class Boundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false, didNotLoad: false };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { failed: true, didNotLoad: error instanceof PageLoadError };
  }

  componentDidUpdate(prevProps: BoundaryProps) {
    // Going to another page (with the back button, say) gives it a fresh start.
    if (this.state.failed && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false, didNotLoad: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;

    const { didNotLoad } = this.state;
    return (
      <Box role="alert" sx={{ maxWidth: 420, mx: 'auto', px: 3, pt: '25vh', textAlign: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
          {didNotLoad ? "This page didn't load" : 'Something went wrong'}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {didNotLoad ? 'Check your connection, then try again.' : 'Reloading the page usually fixes this.'}
        </Typography>
        <Button variant="contained" disableElevation sx={{ textTransform: 'none' }} onClick={() => window.location.reload()}>
          {didNotLoad ? 'Try again' : 'Reload'}
        </Button>
      </Box>
    );
  }
}

/**
 * Says what went wrong, with a way to retry, when a page fails to download or crashes, instead of
 * leaving the screen blank. Kept free of the page layout, which may be what crashed.
 */
const PageErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  return <Boundary resetKey={pathname}>{children}</Boundary>;
};

export default PageErrorBoundary;
