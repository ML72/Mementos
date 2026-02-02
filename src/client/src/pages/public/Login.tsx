import React, { useState } from 'react';
import {
  Container,
  Typography,
  TextField,
  Button,
  Box,
  Paper,
  Tabs,
  Tab
} from '@mui/material';
import { useDispatch } from 'react-redux';
import { setNewAlert } from '../../service/alert';
import { login, register } from '../../service/auth';
import { useNavigate } from 'react-router-dom';
import CustomPage from '../../components/layout/CustomPage';

const Login: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [tabVal, setTabVal] = useState(0);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabVal(newValue);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  };

  const isLogin = tabVal === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
        if (!email || !password) {
      setNewAlert(dispatch, { msg: "Please fill in all fields", alertType: 'error' });
      return;
    }

    if (!isLogin) {
      if (password !== confirmPassword) {
        setNewAlert(dispatch, { msg: "Passwords do not match", alertType: 'error' });
        return;
      }
      const success = await register(dispatch, { email, password });
      if (success) navigate('/home');
    } else {
      const success = await login(dispatch, { email, password });
      if (success) navigate('/home');
    }
  };


  return (
    <CustomPage showNavigation={false}>
      <Container maxWidth="xs" sx={{ mt: 8 }}>
        <Paper elevation={3} sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Typography component="h1" variant="h5" gutterBottom>
            {isLogin ? 'Sign in' : 'Register'}
          </Typography>
                    <Box sx={{ width: '100%', mb: 2 }}>
            <Tabs value={tabVal} onChange={handleTabChange} centered>
              <Tab label="Login" />
              <Tab label="Register" />
            </Tabs>
          </Box>

          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1, width: '100%' }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {!isLogin && (
              <TextField
                margin="normal"
                required
                fullWidth
                name="confirmPassword"
                label="Confirm Password"
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            )}
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
            >
              {isLogin ? 'Sign In' : 'Sign Up'}
            </Button>
          </Box>
        </Paper>
      </Container>
    </CustomPage>
  );
};

export default Login;
