import React, { ReactNode } from 'react';
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { Container, Box } from '@mui/material';

import Alert from './Alert';
import PersistentDrawer from './PersistentDrawer';

interface ComponentProps {
  useBindingContainer?: boolean;
  showNavigation?: boolean;
  children?: ReactNode;
}

const CustomPage: React.FC<ComponentProps> = ({ useBindingContainer = true, showNavigation = true, children = [] }: ComponentProps) => {
  
  const theme: any = createTheme({
    palette: {
      primary: {
        main: "#007ACC",
        light: "#64ace0ff",
        dark: "#005A9C",
      },
      secondary: {
        main: "#696969",
      }
    },
    shape: {
      borderRadius: 5,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none'
          }
        }
      }
    }
  });

  const drawerWidth = 220;

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth={useBindingContainer ? "lg" : false} disableGutters={!useBindingContainer}>
        {showNavigation && <PersistentDrawer />}
        <Box sx={showNavigation ? { ml: `${drawerWidth}px`, width: `calc(100% - ${drawerWidth}px)` } : { width: '100%' }}>
          {children}
        </Box>
      </Container>
      <Alert />
    </ThemeProvider>
  );
};

export default CustomPage;