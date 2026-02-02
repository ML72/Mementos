import React from 'react';
import { Button, Container, Typography, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import CustomPage from '../../components/layout/CustomPage';

const Landing: React.FC = () => {
  const navigate = useNavigate();

  return (
    <CustomPage useBindingContainer={false} showNavigation={false}>
      <Box sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        p: 4,
        backgroundColor: '#f5f5f5'
      }}>
        <Container maxWidth="sm">
          <Typography variant="h2" component="h1" gutterBottom sx={{ color: '#333' }}>
            MERN Template
          </Typography>
          <Typography variant="h5" color="textSecondary" paragraph>
            A barebones template for building MERN stack applications with basic authentication using JWT.
          </Typography>
          <Box sx={{ mt: 4 }}>
            <Button 
              variant="contained" 
              color="primary" 
              size="large"
              onClick={() => navigate('/login')}
              sx={{ px: 4, py: 1.5, fontSize: '1.2rem', backgroundColor: '#333', color: 'white', '&:hover': { backgroundColor: '#555' } }}
            >
              Try Out Login
            </Button>
          </Box>
        </Container>
      </Box>
    </CustomPage>
  );
};


export default Landing;
