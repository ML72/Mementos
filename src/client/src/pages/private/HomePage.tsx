import React from 'react';
import { Button, Container, Typography, Box, Paper } from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store/store';
import { logout } from '../../service/auth';
import { setNewAlert } from '../../service/alert';
import CustomPage from '../../components/layout/CustomPage';
import { useNavigate } from 'react-router-dom';

const HomePage: React.FC = () => {
  const { email } = useSelector((state: RootState) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const onLogout = () => {
    logout(dispatch);
    navigate('/');
  };


  const onHelloWorld = () => {
    setNewAlert(dispatch, { msg: "Hello World!", alertType: 'success' });
  };

  return (
    <CustomPage showNavigation={true}>
      <Container maxWidth="md" sx={{ mt: 8 }}>
        <Paper elevation={3} sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Welcome Home!
          </Typography>
          <Typography variant="h6" color="textSecondary" paragraph>
            You are logged in as: <strong>{email}</strong>
          </Typography>
                    <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Button 
              variant="contained" 
              color="primary" 
              onClick={onHelloWorld}
            >
              Say Hello
            </Button>
            <Button 
              variant="outlined" 
              color="secondary" 
              onClick={onLogout}
            >
              Log Out
            </Button>
          </Box>
        </Paper>
      </Container>
    </CustomPage>
  );
};

export default HomePage;
