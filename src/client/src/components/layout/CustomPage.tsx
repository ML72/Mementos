import React, { ReactNode } from 'react';
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { Container, Box, GlobalStyles } from '@mui/material';

import Alert from './Alert';
import Navbar from './Navbar';

interface ComponentProps {
  useBindingContainer?: boolean;
  showNavigation?: boolean; // We can use this to hide navbar entirely if needed
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

  return (
    <ThemeProvider theme={theme}>
      {/* Text outside a Typography (e.g. a bare Link, which inherits its font) would otherwise get the browser default */}
      <GlobalStyles styles={{ body: { fontFamily: theme.typography.fontFamily } }} />
      {showNavigation && <Navbar />}
      <Container maxWidth={useBindingContainer ? "lg" : false} disableGutters={!useBindingContainer}>
        <Box sx={{ width: '100%' }}>
          {children}
        </Box>
      </Container>
      <Alert />
    </ThemeProvider>
  );
};

export default CustomPage;