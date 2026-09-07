import React, { useState } from 'react';
import {
  Container,
  Typography,
  TextField,
  Button,
  Box,
  Paper,
  Tabs,
  Tab,
  Stack,
  Link
} from '@mui/material';
import { useDispatch } from 'react-redux';
import { setNewAlert } from '../../service/alert';
import { login, register } from '../../service/auth';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import CustomPage from '../../components/layout/CustomPage';

const Login: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  // The active tab is derived from the URL (?tab=signup) rather than mirrored into state:
  // switching tabs is then a single navigation, and the two can never disagree.
  const tabVal = new URLSearchParams(location.search).get('tab') === 'signup' ? 1 : 0;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setFullName('');    setEmail('');
    setPassword('');
    setConfirmPassword('');
    // Optionally update the URL to match the new tab
    navigate(`/login?tab=${newValue === 1 ? 'signup' : 'login'}`, { replace: true });
  };

  const isLogin = tabVal === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setNewAlert(dispatch, { msg: "Please fill in all fields", alertType: 'error' });
      return;
    }

    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setNewAlert(dispatch, { msg: "Please enter a valid email address", alertType: 'error' });
      return;
    }

    if (!isLogin) {
      if (!fullName) { setNewAlert(dispatch, { msg: "Please enter your full name", alertType: 'error' }); return; } if (!confirmPassword) {
        setNewAlert(dispatch, { msg: "Please confirm your password", alertType: 'error' });
        return;
      }
      if (password !== confirmPassword) {
        setNewAlert(dispatch, { msg: "Passwords do not match", alertType: 'error' });
        return;
      }
      const success = await register(dispatch, { email, password, fullName });
      if (success) navigate('/home');
    } else {
      const success = await login(dispatch, { email, password });
      if (success) navigate('/home');
    }
  };

  return (
    <CustomPage showNavigation={true} useBindingContainer={false}>
      <Box sx={{ backgroundColor: '#F9FAFB', minHeight: 'calc(100vh - 65px)', pt: { xs: 8, md: 16 }, pb: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Container maxWidth="xs" sx={{ mt: 0 }}>
          <Box sx={{ mb: 4, textAlign: 'center' }}>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#111827', mb: 1, letterSpacing: '-0.5px' }}>
              {isLogin ? 'Welcome back' : 'Create an account'}
            </Typography>
            <Typography variant="body1" sx={{ color: '#4B5563' }}>
              {isLogin ? 'Enter your details to access your notes' : 'Join to start building your replay buffer'}
            </Typography>
          </Box>

          <Paper elevation={0} sx={{
            p: { xs: 3, md: 5 },
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            borderRadius: '16px',
            border: '1px solid #E5E7EB',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)'
          }}>
            <Box sx={{ width: '100%', mb: 3 }}>
              <Tabs
                value={tabVal}
                onChange={handleTabChange}
                variant="fullWidth"
                TabIndicatorProps={{ sx: { backgroundColor: '#000', height: 3 } }}
                sx={{
                  borderBottom: 1,
                  borderColor: 'divider',
                  minHeight: 48,
                  '& .MuiTab-root': {
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '1rem',
                    color: '#6B7280',
                    '&.Mui-selected': {
                      color: '#111827'
                    }
                  }
                }}
              >
                <Tab label="Sign in" />
                <Tab label="Sign up" />
              </Tabs>
            </Box>

            <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1, width: '100%' }}>
                            <Stack spacing={2.5}>
                {!isLogin && (
                  <TextField
                    fullWidth
                    id="fullName"
                    label="Full Name"
                    name="fullName"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    variant="outlined"
                    sx={{
                      '& .MuiOutlinedInput-root': { borderRadius: '8px' }
                    }}
                  />
                )}
                <TextField
                  fullWidth
                  id="email"
                  label="Email Address"
                  name="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  variant="outlined"
                  sx={{
                    '& .MuiOutlinedInput-root': { borderRadius: '8px' }
                  }}
                />
                <TextField
                  fullWidth
                  name="password"
                  label="Password"
                  type="password"
                  id="password"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  variant="outlined"
                  sx={{
                    '& .MuiOutlinedInput-root': { borderRadius: '8px' }
                  }}
                />
                {isLogin && (
                  <Box sx={{ textAlign: 'right', mt: -1.5 }}>
                    <Link
                      component={RouterLink}
                      to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`}
                      underline="hover"
                      sx={{ fontSize: '0.9rem', color: '#4B5563', fontWeight: 500 }}
                    >
                      Forgot password?
                    </Link>
                  </Box>
                )}
                {!isLogin && (
                  <TextField
                    fullWidth
                    name="confirmPassword"
                    label="Confirm Password"
                    type="password"
                    id="confirmPassword"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    variant="outlined"
                    sx={{
                      '& .MuiOutlinedInput-root': { borderRadius: '8px' }
                    }}
                  />
                )}

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  size="large"
                  sx={{
                    mt: 2,
                    py: 1.5,
                    fontSize: '1.05rem',
                    fontWeight: 600,
                    backgroundColor: '#000000',
                    color: '#ffffff',
                    borderRadius: '8px',
                    textTransform: 'none',
                    boxShadow: 'none',
                    '&:hover': { backgroundColor: '#333333', boxShadow: 'none' }
                  }}
                >
                  {isLogin ? 'Sign In' : 'Sign Up'}
                </Button>
              </Stack>
            </Box>
          </Paper>
        </Container>
      </Box>
    </CustomPage>
  );
};

export default Login;
